<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue';
import type { VNode } from 'vue';
import { serialize_path } from '@svedit/vue';
import Icon from './Icon.vue';
import NodeNavigator from './NodeNavigator.vue';
import type { AppSession } from '../demo_session.js';

const props = defineProps<{ session: AppSession; focus_canvas: () => void }>();
const editable = defineModel<boolean>('editable', { default: false });

function toggle_editable() {
	if (editable.value) {
		props.session.selection = null;
	}
	editable.value = !editable.value;
}

const selection_type = computed(() => props.session.selection?.type ?? null);

// Check if we have a collapsed node selection (node caret)
const is_node_caret = computed(
	() =>
		props.session.selection?.type === 'node' &&
		props.session.selection.anchor_offset === props.session.selection.focus_offset
);

// Get default node_type for current node_array
const default_node_type = computed(() => {
	if (!is_node_caret.value) return null;

	const node_array_path = props.session.selection.path;
	const node_array_node = props.session.get(node_array_path.slice(0, -1)); // Get the parent node
	const node_array_property = node_array_path.at(-1); // Get the property name

	// Get schema for this node type
	const node_schema = props.session.schema[node_array_node?.type];
	if (!node_schema) return null;

	// Get property schema
	const property_definition = node_schema.properties[node_array_property];
	if (property_definition?.type !== 'node_array') return null;

	return (
		property_definition.default_node_type ||
		(property_definition.node_types?.length === 1 ? property_definition.node_types[0] : null)
	);
});

const can_insert_default = computed(() =>
	Boolean(
		is_node_caret.value &&
		default_node_type.value &&
		props.session.config.inserters?.[default_node_type.value]
	)
);

const can_delete = computed(
	() => selection_type.value === 'node' || selection_type.value === 'property'
);

function insert_default_node(event: Event) {
	event.preventDefault();
	const inserter = default_node_type.value
		? props.session.config.inserters?.[default_node_type.value]
		: null;
	if (!is_node_caret.value || !inserter) return;

	const tr = props.session.tr;
	inserter(tr);
	props.session.apply(tr);
}

function delete_node_selection(event: Event) {
	event.preventDefault();
	if (!can_delete.value) return;
	props.session.apply(props.session.tr.delete_selection('backward'));
}

function select_parent(event: Event) {
	event.preventDefault();
	if (props.session.commands.select_parent?.disabled) return;
	props.session.commands.select_parent?.execute();
}

// While a pointer drags a selection the floating toolbar stays hidden,
// otherwise it flickers along the growing selection. It appears
// instantly on pointer up.
const is_dragging = ref(false);

function handle_window_pointerdown(event: PointerEvent) {
	// Presses on the toolbars themselves must not hide them
	if (event.target instanceof Element && event.target.closest('.editor-toolbar')) return;
	is_dragging.value = true;
}

function handle_window_pointerup() {
	is_dragging.value = false;
}

// Check if we should show the image URL input
const show_image_input = computed(
	() =>
		props.session.selection?.type === 'property' && props.session.selection.path.at(-1) === 'image'
);

// Link mark touched by the current text selection. Link marks are edited
// in the anchored link popover (LinkActionOverlay) which replaces the
// floating toolbar in that state — same pill, same placement, so the
// link toggle reads as a morph from toolbar to popover.
const active_link_mark = computed(() =>
	props.session.active_mark?.node.type === 'link' ? props.session.active_mark : null
);

// Show the link URL input when a node carrying an href is selected
// (e.g. a button); link marks are handled by the link popover instead.
const show_link_input = computed(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	() => typeof (props.session.selected_node as any)?.href === 'string'
);

// Get current image URL value
const current_image_url = computed(() =>
	show_image_input.value ? props.session.get(props.session.selection.path) : ''
);

// Get current link URL value
const current_link_url = computed(() =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	show_link_input.value ? ((props.session.selected_node as any)?.href ?? '') : ''
);

// NOTE: The URL input is deliberately NOT auto-focused when it appears
// (e.g. after creating a link or a button): stealing focus from the
// canvas causes a focus race — clicking back into text re-renders the
// canvas from its unfocused state, which grabs focus again and the
// URL editor won't close. Users focus the input explicitly instead.
// Unchanged values are skipped: the change event fires on blur and also
// right after an Enter commit, and each edit session should produce
// exactly one set (single history entry), never a duplicate.
function update_url(value: string) {
	const session = props.session;
	const tr = session.tr;
	if (session.selection.path.at(-1) === 'content') {
		// We are updating the href property of a button
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if (value === ((session.selected_node as any)?.href ?? '')) return;
		tr.set([...session.selection.path.slice(0, -1), 'href'], value);
	} else {
		// Otherwise it's the image property
		if (value === session.get(session.selection.path)) return;
		tr.set(session.selection.path, value);
	}
	session.apply(tr);
}

function handle_toolbar_keydown(event: KeyboardEvent) {
	// The URL inputs render in both toolbars (floating and bottom), so the
	// value is read from the event target instead of a bound input reference.
	const is_url_input = event.target instanceof HTMLInputElement && event.target.type === 'url';
	if (event.key === 'Enter' && is_url_input) {
		update_url((event.target as HTMLInputElement).value);
		event.preventDefault();
		event.stopPropagation();
		// Apply the change and return focus to canvas
		props.focus_canvas();
	} else if (event.key === 'Escape') {
		// Cancel and return focus to canvas without applying changes. A
		// link that was just created empty is removed again, so Escape
		// cancels the whole link creation.
		if (is_url_input) {
			// Reset the field to the committed value before focus moves
			// back to the canvas, so the change event fired on blur
			// doesn't commit the discarded text.
			const input = event.target as HTMLInputElement;
			input.value =
				input.getAttribute('aria-label') === 'Image URL'
					? current_image_url.value
					: current_link_url.value;
		}
		event.preventDefault();
		event.stopPropagation();
		props.focus_canvas();
	}
}

// Anchor for the floating toolbar. Every selectable element exposes
// anchor-name: --{serialized_path}, so the toolbar attaches to the element
// owning the current selection with pure CSS anchor positioning.
// last_node_anchor (multi-node only) is the last selected node's path,
// exposed as --last-selected-node-anchor for a position-try fallback.
const floating_anchor = computed(
	(): {
		name: string;
		last_node_anchor?: string;
	} | null => {
		if (!editable.value) return null;
		const sel = props.session.selection;
		if (!sel) return null;

		if (sel.type === 'text') {
			// No toolbar at a collapsed text caret: it would hover over the
			// line above while the user is typing.
			if (sel.anchor_offset === sel.focus_offset) return null;
			// When the selection touches a link mark, the link popover owns
			// this spot (same pill, same anchor) — the toolbar yields.
			if (active_link_mark.value) return null;
			return { name: serialize_path(sel.path) };
		}

		if (sel.type === 'property') {
			return { name: serialize_path(sel.path) };
		}

		if (sel.type === 'node') {
			const start = Math.min(sel.anchor_offset, sel.focus_offset);
			const end = Math.max(sel.anchor_offset, sel.focus_offset);
			if (start !== end) {
				// Anchor to the first selected node. When multiple nodes are
				// selected, last_node_anchor lets CSS fall back to below the
				// last one when above the first overflows.
				return {
					name: serialize_path([...sel.path, start]),
					...(end - start > 1 ? { last_node_anchor: serialize_path([...sel.path, end - 1]) } : {})
				};
			}
			// Node caret: insertion is offered by the in-gap tool
			// (system_components.node_gap_tools → GapInsertTool), which
			// renders inside the active gap marker — not by the floating
			// toolbar.
			return null;
		}

		return null;
	}
);

// Distance the visual viewport bottom sits above the layout viewport
// bottom. Chromium and Firefox resize the layout viewport when the
// virtual keyboard opens (interactive-widget=resizes-content), so this
// stays 0 there. iOS Safari only shrinks and pans the visual viewport,
// so the bottom toolbar must be translated up by this inset to stay
// visible above the keyboard, also while scrolling.
const keyboard_inset = ref(0);
let stop_keyboard_tracking: (() => void) | undefined;

function start_keyboard_tracking() {
	const visual_viewport = window.visualViewport;
	if (!visual_viewport) return;

	let current = keyboard_inset.value;
	let target = current;
	let raf = 0;

	function measure() {
		target = Math.max(
			0,
			Math.round(window.innerHeight - visual_viewport!.height - visual_viewport!.offsetTop)
		);
		if (!raf) raf = requestAnimationFrame(follow);
	}

	// Exponential follower: large distances (keyboard opening) are covered
	// within a few frames while the small stale-position corrections that
	// Safari reports during touch pans get smoothed instead of rendering
	// as jitter. Speed adapts to the remaining distance by construction.
	function follow() {
		raf = 0;
		const delta = target - current;
		if (Math.abs(delta) <= 1) {
			current = target;
		} else {
			current += delta * 0.35;
			raf = requestAnimationFrame(follow);
		}
		keyboard_inset.value = current;
	}

	measure();
	visual_viewport.addEventListener('resize', measure);
	visual_viewport.addEventListener('scroll', measure);
	stop_keyboard_tracking = () => {
		cancelAnimationFrame(raf);
		visual_viewport.removeEventListener('resize', measure);
		visual_viewport.removeEventListener('scroll', measure);
	};
}

onMounted(() => {
	window.addEventListener('pointerdown', handle_window_pointerdown);
	window.addEventListener('pointerup', handle_window_pointerup);
	window.addEventListener('pointercancel', handle_window_pointerup);
	start_keyboard_tracking();
});

onBeforeUnmount(() => {
	window.removeEventListener('pointerdown', handle_window_pointerdown);
	window.removeEventListener('pointerup', handle_window_pointerup);
	window.removeEventListener('pointercancel', handle_window_pointerup);
	stop_keyboard_tracking?.();
});

// -------------------------------------------------------------------
// Reusable toolbar snippets. They are rendered by both the floating and
// the bottom toolbar, so they are plain functional components built with
// `h()` and closing over this component's state.
// -------------------------------------------------------------------

const Divider = () => h('span', { class: 'divider', 'aria-hidden': 'true' });

// Way back up the node hierarchy, like Notion's << button in its text
// formatting toolbar. Repeated presses ascend text -> node -> parent node
// etc. Hidden entirely at the top level where there is no parent, and
// pinned to the left edge of a scrollable bar so it stays reachable.
const SelectParentButton = () => {
	const command = props.session.commands.select_parent;
	if (!command || command.disabled) return null;
	return h('span', { class: 'select-parent-group' }, [
		h('button', { title: 'Select parent (Esc)', onMousedown: select_parent }, [
			h(Icon, { name: 'escape' })
		]),
		h(Divider)
	]);
};

function command_button(
	command_name: string,
	title: string,
	icon: string,
	css_class?: string
): VNode | null {
	const command = props.session.commands[command_name];
	if (!command) return null;
	return h(
		'button',
		{
			title,
			class: [css_class, { active: command.active }],
			disabled: command.disabled,
			onMousedown: (event: Event) => {
				event.preventDefault();
				command.execute();
			}
		},
		[h(Icon, { name: icon })]
	);
}

const MarkButtons = () => [
	command_button('toggle_strong', 'Bold', 'bold', 'bold'),
	command_button('toggle_emphasis', 'Italic', 'italic', 'italic'),
	command_button('toggle_code', 'Code (⌘ ⇧ C)', 'code', 'code'),
	command_button('toggle_highlight', 'Highlight', 'text-scribble', 'highlight'),
	command_button('toggle_link', 'Link', 'link')
];

// Section marks and markers span whole nodes, so they belong to the node
// selection tools, not the text tools.
const NodeMarkButtons = () => [
	command_button('toggle_section', 'Section (⌘ ⇧ S)', 'bracket-vertical'),
	command_button('toggle_marker', 'Marker (⌘ ⇧ M)', 'note-marker')
];

const InsertButton = () =>
	h(
		'button',
		{ title: 'Insert (↵)', onMousedown: insert_default_node, disabled: !can_insert_default.value },
		[
			h(
				'svg',
				{
					class: 'toolbar-icon',
					xmlns: 'http://www.w3.org/2000/svg',
					viewBox: '0 0 15 15',
					fill: 'none',
					'aria-hidden': 'true'
				},
				[h('path', { d: 'M7.5 3V12M3 7.5H12', stroke: 'currentColor', 'stroke-linecap': 'square' })]
			)
		]
	);

const DeleteButton = () =>
	h(
		'button',
		{
			title: 'Delete backwards (⌫)',
			onMousedown: delete_node_selection,
			disabled: !can_delete.value
		},
		[h(Icon, { name: 'backspace-delete' })]
	);

// Rendered unconditionally: commands register only after Svedit has
// initialized, and the persistent bottom bar must not reflow on first
// paint when undo/redo appear. Until then the buttons are disabled.
const HistoryButtons = () => [
	h(
		'button',
		{
			title: 'Undo',
			onMousedown: (event: Event) => {
				event.preventDefault();
				props.session.commands.undo?.execute();
			},
			disabled: props.session.commands.undo?.disabled ?? true
		},
		[h(Icon, { name: 'undo' })]
	),
	h(
		'button',
		{
			title: 'Redo',
			onMousedown: (event: Event) => {
				event.preventDefault();
				props.session.commands.redo?.execute();
			},
			disabled: props.session.commands.redo?.disabled ?? true
		},
		[h(Icon, { name: 'redo' })]
	)
];

const ContextualInputs = () => {
	const inputs: VNode[] = [];
	if (show_image_input.value) {
		inputs.push(
			h('div', { class: 'contextual-input' }, [
				h('label', [
					h('input', {
						type: 'url',
						value: current_image_url.value,
						placeholder: 'Enter image URL',
						'aria-label': 'Image URL',
						onChange: (event: Event) => update_url((event.currentTarget as HTMLInputElement).value)
					})
				])
			])
		);
	}
	if (show_link_input.value) {
		inputs.push(
			h('div', { class: 'contextual-input' }, [
				h('label', [
					h('input', {
						type: 'url',
						value: current_link_url.value,
						placeholder: 'Enter link URL',
						'aria-label': 'Link URL',
						onChange: (event: Event) => update_url((event.currentTarget as HTMLInputElement).value)
					})
				])
			])
		);
	}
	return inputs;
};
</script>

<template>
	<!-- Re-mount the toolbar whenever the anchor changes: swapping
	     position-anchor on a persistent fixed element can leave it at the
	     stale position of the previous anchor. -->
	<div
		v-if="floating_anchor && !is_dragging"
		:key="floating_anchor.name"
		class="editor-toolbar floating-toolbar"
		:class="{ 'has-last-node-anchor': Boolean(floating_anchor.last_node_anchor) }"
		:style="`position-anchor: --${floating_anchor.name};${
			floating_anchor.last_node_anchor
				? ` --last-selected-node-anchor: --${floating_anchor.last_node_anchor};`
				: ''
		}`"
		@keydown="handle_toolbar_keydown"
	>
		<div class="toolbar-scroller">
			<!-- Only the tools that belong to the current selection context: text
			     selections get text tools, node and property selections the node
			     tools. Node carets are handled by GapInsertTool instead. -->
			<template v-if="selection_type === 'text'">
				<SelectParentButton />
				<MarkButtons />
				<!-- No divider: the input belongs to the link tool right before it -->
				<ContextualInputs v-if="show_link_input" />
			</template>
			<template v-else-if="selection_type === 'node'">
				<SelectParentButton />
				<NodeMarkButtons />
				<NodeNavigator :session="session" :focus_canvas="focus_canvas" />
				<template v-if="show_link_input">
					<Divider />
					<ContextualInputs />
				</template>
				<DeleteButton />
			</template>
			<template v-else-if="selection_type === 'property'">
				<SelectParentButton />
				<NodeNavigator :session="session" :focus_canvas="focus_canvas" />
				<template v-if="show_image_input">
					<Divider />
					<ContextualInputs />
				</template>
				<DeleteButton />
			</template>
		</div>
	</div>

	<div
		class="editor-toolbar bottom-toolbar"
		:style="{ '--keyboard-inset': `${keyboard_inset}px` }"
		@keydown="handle_toolbar_keydown"
	>
		<div class="toolbar-scroller">
			<template v-if="editable">
				<!-- Same contextual composition as the floating toolbar: text tools for
				     text selections, just the insert button at node gaps, node tools for
				     node and property selections. -->
				<div class="contextual-tools">
					<template v-if="selection_type === 'text'">
						<SelectParentButton />
						<MarkButtons />
						<!-- No divider: the input belongs to the link tool right before it -->
						<ContextualInputs v-if="show_link_input" />
						<Divider />
					</template>
					<template v-else-if="is_node_caret">
						<template v-if="can_insert_default">
							<InsertButton />
							<Divider />
						</template>
					</template>
					<template v-else-if="selection_type === 'node'">
						<SelectParentButton />
						<NodeMarkButtons />
						<NodeNavigator :session="session" :focus_canvas="focus_canvas" />
						<template v-if="show_link_input">
							<Divider />
							<ContextualInputs />
						</template>
						<Divider />
					</template>
					<template v-else-if="selection_type === 'property'">
						<SelectParentButton />
						<NodeNavigator :session="session" :focus_canvas="focus_canvas" />
						<template v-if="show_image_input">
							<Divider />
							<ContextualInputs />
						</template>
						<Divider />
					</template>
				</div>
				<HistoryButtons />
				<!-- Destructive action last, behind undo/redo: harder to hit by
				     accident while scrolling the bar, and undo sits right next to
				     it when it does happen. -->
				<div v-if="can_delete" class="contextual-tools">
					<Divider />
					<DeleteButton />
				</div>
			</template>
			<!-- Save pinned to the right edge of the scroller so it never needs
			     scrolling. The custom hide-keyboard tool was removed: the native
			     iOS checkmark in the form assistant bar dismisses the keyboard,
			     and that bar cannot be suppressed from web content anyway. -->
			<div class="save-group" :class="{ 'has-leading-tools': editable }">
				<Divider v-if="editable" />
				<button class="toggle-editable" @click="toggle_editable">
					{{ editable ? 'Save' : 'Edit' }}
				</button>
			</div>
		</div>
	</div>
</template>

<!-- The toolbar snippets above are functional components, which don't carry
     this component's scope id, so the toolbar styles are global. Every rule
     is prefixed with a toolbar class to keep them local in practice. -->
<style>
/* Both toolbars share one unified pill container: a single surface,
	   border and shadow instead of per-button bubbles. The pill itself does
	   not scroll — scrolling lives in the unpadded inner scroller below, so
	   pinned (sticky) tools sit at the exact scrollport edge and scrolled
	   content can never leak into the pill's padding or rounded corners. */
.editor-toolbar {
	/* One shared cap for wide contextual elements (URL inputs, the
		   NodeNavigator variant label) so no single tool can push the others
		   out of the bar. */
	--toolbar-item-max-width: 200px;
	display: flex;
	align-items: center;
	width: fit-content;
	padding: 4px;
	color: var(--foreground);
	background: var(--background);
	border: 1px solid oklch(from var(--foreground) l c h / 0.12);
	border-radius: 9999px;
	box-shadow:
		0 1px 2px oklch(0% 0 0 / 0.12),
		0 4px 16px oklch(0% 0 0 / 0.08);
	z-index: 50;
	pointer-events: auto;
	max-width: calc(100vw - 2 * var(--s-4));
}

.editor-toolbar .toolbar-scroller {
	display: flex;
	flex-direction: row;
	align-items: center;
	/* No gap between buttons: adjacent hitboxes tile the toolbar without
		   dead zones, the visual spacing comes from the icon padding inside
		   each 36px button. */
	gap: 0;
	min-width: 0;
	overflow-x: auto;
	scrollbar-width: none;
	/* Round the clip box itself so content and the opaque sticky
		   backgrounds can never draw over the pill's curved border. */
	border-radius: 9999px;
}

.bottom-toolbar {
	position: fixed;
	/* The safe-area inset already provides clearance above the home
		   indicator, so take the larger of the two offsets instead of
		   stacking them. */
	bottom: max(var(--s-4), env(safe-area-inset-bottom, 0px));
	right: var(--s-4);
}

@position-try --stay-in-viewport {
	position-area: none;
	position-anchor: none;
	top: calc(var(--top-toolbar-safe-area, 0px) + var(--s-2));
	right: auto;
	bottom: auto;
	left: auto;
}

/* Multi-node selection: when above the first node overflows, sit below
	   the last selected node instead (--last-selected-node-anchor). */
@position-try --below-last-node {
	position-anchor: var(--last-selected-node-anchor);
	bottom: auto;
	top: anchor(bottom);
	margin-bottom: 0;
	margin-top: var(--s-2);
}

.floating-toolbar {
	position: fixed;
	bottom: anchor(top);
	justify-self: anchor-center;
	margin-bottom: var(--s-2);
	position-visibility: always;
	position-try-fallbacks: --stay-in-viewport, flip-block;
	z-index: 60;
}

.floating-toolbar.has-last-node-anchor {
	position-try-fallbacks: --below-last-node, --stay-in-viewport, flip-block;
}

/* The floating toolbar targets precise mouse interactions. On touch
	   devices all tools live in the single bottom toolbar instead, so the
	   virtual keyboard handling only has one element to care about. */
@media (hover: none), (pointer: coarse) {
	.floating-toolbar {
		display: none;
	}

	.bottom-toolbar {
		right: auto;
		left: 50%;
		/* No transition here: the keyboard inset updates on every visual
			   viewport scroll event and easing towards each new value makes
			   the toolbar visibly lag behind the finger. */
		transform: translateX(-50%) translateY(calc(-1 * var(--keyboard-inset, 0px)));
	}

	/* Hint that more tools are reachable by scrolling */
	.bottom-toolbar .toolbar-scroller {
		scrollbar-width: none;
	}
}

.editor-toolbar .contextual-tools {
	display: contents;
}

@media (hover: hover) and (pointer: fine) {
	.bottom-toolbar .contextual-tools {
		display: none;
	}
}

/* Save pinned to the right edge of the scrollable bar so it stays
	   reachable without scrolling. Mirrors the select-parent group: gap at
	   rest via outer margin, divider flush with the opaque background while
	   pinned so no white strip reads as a second line. */
.editor-toolbar .save-group {
	position: sticky;
	right: 0;
	z-index: 1;
	display: flex;
	align-items: center;
	flex: none;
	background: var(--background);
}

.editor-toolbar .save-group.has-leading-tools {
	margin-inline-start: 4px;
}

.editor-toolbar .save-group .divider {
	margin-inline-start: 0;
}

.editor-toolbar .divider {
	flex: none;
	width: 1px;
	height: 20px;
	/* Keep the non-interactive strip between hitboxes minimal */
	margin-inline: 4px;
	background: oklch(from var(--foreground) l c h / 0.15);
}

.editor-toolbar button:not(.toggle-editable) {
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	width: 36px;
	height: 36px;
	min-width: 36px;
	min-height: 36px;
	aspect-ratio: 1 / 1;
	padding: 0;
	flex: 0 0 36px;
	border: none;
	border-radius: 50%;
	background: transparent;
	color: var(--foreground);
	text-wrap: nowrap;
	cursor: pointer;
	pointer-events: auto;
	transition:
		background 150ms,
		transform 150ms;
	outline: 1px solid transparent;
	--icon-color: var(--foreground);
	position: relative;
}

/* Hover styles only on devices that actually hover, otherwise touch
	   browsers keep the emulated hover state stuck on a button after a tap. */
@media (hover: hover) {
	.editor-toolbar button:not(.toggle-editable):hover:not(:disabled) {
		background: oklch(from var(--foreground) l c h / 0.06);
	}
}

.editor-toolbar button:not(.toggle-editable):active:not(:disabled) {
	background: oklch(from var(--foreground) l c h / 0.09);
	transform: translateY(1px) scale(0.95);
}

.editor-toolbar button:not(.toggle-editable):focus-visible {
	outline: none;
	box-shadow: inset 0 0 0 1px var(--editing);
}

.editor-toolbar button:not(.toggle-editable):disabled {
	background: transparent;
	cursor: not-allowed;
	--icon-color: oklch(from var(--foreground) l c h / 0.3);
}

/* Same translucent brand fill the text selection uses, so the active
	   state and the icon color always derive from one variable. */
.editor-toolbar button:not(.toggle-editable).active {
	color: var(--editing);
	background: var(--editing-muted);
	--icon-color: var(--editing);
}

/* Select-parent pinned to the left edge of the scroller, mirroring the
	   keyboard tools on the right. The scroller is unpadded, so the pinned
	   group sits exactly at the scrollport edge with nothing shining
	   through, and at rest it never overlaps the neighboring tool. */
.editor-toolbar .select-parent-group {
	position: sticky;
	left: 0;
	z-index: 1;
	display: flex;
	align-items: center;
	flex: none;
	background: var(--background);
	/* Breathing room towards the neighboring tool lives outside the
		   group as margin: it keeps the divider flush with the opaque
		   background while pinned, so no white strip reads as a second line. */
	margin-inline-end: 4px;
}

.editor-toolbar .select-parent-group .divider {
	margin-inline-end: 0;
}

.editor-toolbar .toggle-editable {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	height: 36px;
	min-height: 36px;
	flex: none;
	padding: 0 1rem;
	border: none;
	border-radius: 9999px;
	background: transparent;
	color: var(--editing);
	font-size: 0.875rem;
	font-weight: 600;
	line-height: 1;
	text-decoration: none;
	cursor: pointer;
	pointer-events: auto;
	transition:
		background 150ms,
		transform 150ms;
	outline: 1px solid transparent;
}

@media (hover: hover) {
	.editor-toolbar .toggle-editable:hover {
		background: oklch(from var(--editing) l c h / 0.08);
	}
}

.editor-toolbar .toggle-editable:active {
	background: oklch(from var(--editing) l c h / 0.12);
	transform: translateY(1px) scale(0.97);
}

.editor-toolbar .toggle-editable:focus-visible {
	outline: none;
	box-shadow: inset 0 0 0 1px var(--editing);
}

.editor-toolbar .toolbar-icon {
	width: var(--icon-size, 24px);
	height: var(--icon-size, 24px);
	color: var(--icon-color, var(--foreground));
}

.editor-toolbar .contextual-input {
	display: flex;
	align-items: center;
	gap: var(--s-2);
}

.editor-toolbar .contextual-input label {
	display: flex;
	align-items: center;
	gap: var(--s-1);
	font-size: 14px;
	white-space: nowrap;
}

/* Flat inside the toolbar pill: no own border or background. Inputs
	   don't inherit the page font by default, so without font: inherit
	   this would render in the UA's system font. iOS Safari's focus zoom
	   on sub-16px inputs is prevented via maximum-scale=1 in index.html,
	   not by inflating the font size. */
.editor-toolbar .contextual-input input {
	padding: var(--s-1) var(--s-2);
	border: none;
	background: transparent;
	color: var(--foreground);
	font: inherit;
	font-feature-settings: 'calt' 0;
	font-size: 14px;
	/* Fixed width on purpose: field-sizing measures the placeholder
		   while empty and the content afterwards, so the bar would
		   visibly shrink on the first typed character. Long URLs scroll
		   within the field. */
	width: 9rem;
	max-width: var(--toolbar-item-max-width);
}

.editor-toolbar .contextual-input input:focus {
	outline: none;
}
</style>
