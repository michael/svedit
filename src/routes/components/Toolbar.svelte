<script lang="ts">
	import { untrack } from 'svelte';
	import { serialize_path } from 'svedit';
	import Icon from './Icon.svelte';
	import NodeNavigator from './NodeNavigator.svelte';
	import type { AppSession } from '../demo_session.js';

	let {
		session,
		focus_canvas,
		editable = $bindable(false)
	}: { session: AppSession; focus_canvas: () => void; editable?: boolean } = $props();

	function toggle_editable() {
		if (editable) {
			session.selection = null;
		}
		editable = !editable;
	}

	let selection_type = $derived(session.selection?.type ?? null);

	// Check if we have a collapsed node selection (node caret)
	let is_node_caret = $derived(
		session.selection?.type === 'node' &&
			session.selection.anchor_offset === session.selection.focus_offset
	);

	// Get default node_type for current node_array
	let default_node_type = $derived.by(() => {
		if (!is_node_caret) return null;

		const node_array_path = session.selection.path;
		const node_array_node = session.get(node_array_path.slice(0, -1)); // Get the parent node
		const node_array_property = node_array_path.at(-1); // Get the property name

		// Get schema for this node type
		const node_schema = session.schema[node_array_node?.type];
		if (!node_schema) return null;

		// Get property schema
		const property_definition = node_schema.properties[node_array_property];
		if (property_definition?.type !== 'node_array') return null;

		return (
			property_definition.default_node_type ||
			(property_definition.node_types?.length === 1 ? property_definition.node_types[0] : null)
		);
	});

	let can_insert_default = $derived(
		Boolean(is_node_caret && default_node_type && session.config.inserters?.[default_node_type])
	);

	let can_delete = $derived(selection_type === 'node' || selection_type === 'property');

	function insert_default_node(event: Event) {
		event.preventDefault();
		const inserter = default_node_type ? session.config.inserters?.[default_node_type] : null;
		if (!is_node_caret || !inserter) return;

		const tr = session.tr;
		inserter(tr);
		session.apply(tr);
	}

	function delete_node_selection(event: Event) {
		event.preventDefault();
		if (!can_delete) return;
		session.apply(session.tr.delete_selection('backward'));
	}

	function select_parent(event: Event) {
		event.preventDefault();
		if (session.commands.select_parent?.disabled) return;
		session.commands.select_parent?.execute();
	}

	// While a pointer drags a selection the floating toolbar stays hidden,
	// otherwise it flickers along the growing selection. It appears
	// instantly on pointer up.
	let is_dragging = $state(false);

	function handle_window_pointerdown(event: PointerEvent) {
		// Presses on the toolbars themselves must not hide them
		if (event.target instanceof Element && event.target.closest('.editor-toolbar')) return;
		is_dragging = true;
	}

	function handle_window_pointerup() {
		is_dragging = false;
	}

	// Check if we should show the image URL input
	let show_image_input = $derived(
		session.selection?.type === 'property' && session.selection.path.at(-1) === 'image'
	);

	// Link mark touched by the current text selection. Link marks are edited
	// in the anchored link popover (LinkActionOverlay) which replaces the
	// floating toolbar in that state — same pill, same placement, so the
	// link toggle reads as a morph from toolbar to popover.
	let active_link_mark = $derived(
		session.active_mark?.node.type === 'link' ? session.active_mark : null
	);

	// Show the link URL input when a node carrying an href is selected
	// (e.g. a button); link marks are handled by the link popover instead.
	let show_link_input = $derived(typeof (session.selected_node as any)?.href === 'string');

	// Get current image URL value
	let current_image_url = $derived(show_image_input ? session.get(session.selection.path) : '');

	// Get current link URL value
	let current_link_url = $derived(
		show_link_input ? ((session.selected_node as any)?.href ?? '') : ''
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
		const tr = session.tr;
		if (session.selection.path.at(-1) === 'content') {
			// We are updating the href property of a button
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
			focus_canvas();
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
					input.getAttribute('aria-label') === 'Image URL' ? current_image_url : current_link_url;
			}
			event.preventDefault();
			event.stopPropagation();
			focus_canvas();
		}
	}

	// Anchor for the floating toolbar. Every selectable element exposes
	// anchor-name: --{serialized_path}, so the toolbar attaches to the element
	// owning the current selection with pure CSS anchor positioning.
	// last_node_anchor (multi-node only) is the last selected node's path,
	// exposed as --last-selected-node-anchor for a position-try fallback.
	let floating_anchor = $derived.by(
		(): {
			name: string;
			placement: 'above' | 'below';
			last_node_anchor?: string;
		} | null => {
			if (!editable) return null;
			const sel = session.selection;
			if (!sel) return null;

			if (sel.type === 'text') {
				// No toolbar at a collapsed text caret: it would hover over the
				// line above while the user is typing.
				if (sel.anchor_offset === sel.focus_offset) return null;
				// When the selection touches a link mark, the link popover owns
				// this spot (same pill, same anchor) — the toolbar yields.
				if (active_link_mark) return null;
				return { name: serialize_path(sel.path), placement: 'above' };
			}

			if (sel.type === 'property') {
				return { name: serialize_path(sel.path), placement: 'above' };
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
						placement: 'above',
						...(end - start > 1 ? { last_node_anchor: serialize_path([...sel.path, end - 1]) } : {})
					};
				}
				// Node caret: the floating toolbar only offers insertion there, so
				// skip it entirely when nothing can be inserted at this gap.
				if (!can_insert_default) return null;
				// Anchor to the node after the caret so the toolbar sits at the
				// gap. At the end of the array anchor to the node before the
				// caret and place the toolbar below it instead.
				const node_array = session.get(sel.path) as { nodes: unknown[] };
				const node_count = node_array.nodes.length;
				if (start < node_count) {
					return { name: serialize_path([...sel.path, start]), placement: 'above' };
				}
				if (node_count > 0) {
					return { name: serialize_path([...sel.path, node_count - 1]), placement: 'below' };
				}
				// Empty node arrays render a placeholder carrying the anchor for index 0
				return { name: serialize_path([...sel.path, 0]), placement: 'above' };
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
	let keyboard_inset = $state(0);

	$effect(() => {
		const visual_viewport = window.visualViewport;
		if (!visual_viewport) return;

		let current = untrack(() => keyboard_inset);
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
			keyboard_inset = current;
		}

		measure();
		visual_viewport.addEventListener('resize', measure);
		visual_viewport.addEventListener('scroll', measure);
		return () => {
			cancelAnimationFrame(raf);
			visual_viewport.removeEventListener('resize', measure);
			visual_viewport.removeEventListener('scroll', measure);
		};
	});
</script>

{#snippet divider()}
	<span class="divider" aria-hidden="true"></span>
{/snippet}

<!-- Way back up the node hierarchy, like Notion's << button in its text
     formatting toolbar. Repeated presses ascend text -> node -> parent node
     etc. Hidden entirely at the top level where there is no parent, and
     pinned to the left edge of a scrollable bar so it stays reachable. -->
{#snippet select_parent_button()}
	{#if session.commands.select_parent && !session.commands.select_parent.disabled}
		<span class="select-parent-group">
			<button title="Select parent (Esc)" onmousedown={select_parent}>
				<Icon name="escape" />
			</button>
			{@render divider()}
		</span>
	{/if}
{/snippet}

{#snippet mark_buttons()}
	{#if session.commands.toggle_strong}
		<button
			title="Bold"
			class="bold"
			onmousedown={(event) => {
				event.preventDefault();
				session.commands.toggle_strong.execute();
			}}
			disabled={session.commands.toggle_strong.disabled}
			class:active={session.commands.toggle_strong.active}
		>
			<Icon name="bold" />
		</button>
	{/if}
	{#if session.commands.toggle_emphasis}
		<button
			title="Italic"
			class="italic"
			onmousedown={(event) => {
				event.preventDefault();
				session.commands.toggle_emphasis.execute();
			}}
			disabled={session.commands.toggle_emphasis.disabled}
			class:active={session.commands.toggle_emphasis.active}
		>
			<Icon name="italic" />
		</button>
	{/if}
	{#if session.commands.toggle_code}
		<button
			title="Code (⌘ ⇧ C)"
			class="code"
			onmousedown={(event) => {
				event.preventDefault();
				session.commands.toggle_code.execute();
			}}
			disabled={session.commands.toggle_code.disabled}
			class:active={session.commands.toggle_code.active}
		>
			<Icon name="code" />
		</button>
	{/if}
	{#if session.commands.toggle_highlight}
		<button
			title="Highlight"
			class="highlight"
			onmousedown={(event) => {
				event.preventDefault();
				session.commands.toggle_highlight.execute();
			}}
			disabled={session.commands.toggle_highlight.disabled}
			class:active={session.commands.toggle_highlight.active}
		>
			<Icon name="text-scribble" />
		</button>
	{/if}
	{#if session.commands.toggle_link}
		<button
			title="Link"
			onmousedown={(event) => {
				event.preventDefault();
				session.commands.toggle_link.execute();
			}}
			disabled={session.commands.toggle_link.disabled}
			class:active={session.commands.toggle_link.active}
		>
			<Icon name="link" />
		</button>
	{/if}
{/snippet}

<!-- Section marks and markers span whole nodes, so they belong to the node
     selection tools, not the text tools. -->
{#snippet node_mark_buttons()}
	{#if session.commands.toggle_section}
		<button
			title="Section (⌘ ⇧ S)"
			onmousedown={(event) => {
				event.preventDefault();
				session.commands.toggle_section.execute();
			}}
			disabled={session.commands.toggle_section.disabled}
			class:active={session.commands.toggle_section.active}
		>
			<Icon name="bracket-vertical" />
		</button>
	{/if}
	{#if session.commands.toggle_marker}
		<button
			title="Marker (⌘ ⇧ M)"
			onmousedown={(event) => {
				event.preventDefault();
				session.commands.toggle_marker.execute();
			}}
			disabled={session.commands.toggle_marker.disabled}
			class:active={session.commands.toggle_marker.active}
		>
			<Icon name="note-marker" />
		</button>
	{/if}
{/snippet}

{#snippet insert_button()}
	<button title="Insert (↵)" onmousedown={insert_default_node} disabled={!can_insert_default}>
		<svg
			class="toolbar-icon"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 15 15"
			fill="none"
			aria-hidden="true"
		>
			<path d="M7.5 3V12M3 7.5H12" stroke="currentColor" stroke-linecap="square" />
		</svg>
	</button>
{/snippet}

{#snippet delete_button()}
	<button title="Delete backwards (⌫)" onmousedown={delete_node_selection} disabled={!can_delete}>
		<Icon name="backspace-delete" />
	</button>
{/snippet}

<!-- Rendered unconditionally: commands register only after Svedit has
     initialized, and the persistent bottom bar must not reflow on first
     paint when undo/redo appear. Until then the buttons are disabled. -->
{#snippet history_buttons()}
	<button
		title="Undo"
		onmousedown={(event) => {
			event.preventDefault();
			session.commands.undo?.execute();
		}}
		disabled={session.commands.undo?.disabled ?? true}
	>
		<Icon name="undo" />
	</button>
	<button
		title="Redo"
		onmousedown={(event) => {
			event.preventDefault();
			session.commands.redo?.execute();
		}}
		disabled={session.commands.redo?.disabled ?? true}
	>
		<Icon name="redo" />
	</button>
{/snippet}

{#snippet contextual_inputs()}
	{#if show_image_input}
		<div class="contextual-input">
			<label>
				<input
					type="url"
					value={current_image_url}
					placeholder="Enter image URL"
					aria-label="Image URL"
					onchange={(event) => update_url(event.currentTarget.value)}
				/>
			</label>
		</div>
	{/if}
	{#if show_link_input}
		<div class="contextual-input">
			<label>
				<input
					type="url"
					value={current_link_url}
					placeholder="Enter link URL"
					aria-label="Link URL"
					onchange={(event) => update_url(event.currentTarget.value)}
				/>
			</label>
		</div>
	{/if}
{/snippet}

<svelte:window
	onpointerdown={handle_window_pointerdown}
	onpointerup={handle_window_pointerup}
	onpointercancel={handle_window_pointerup}
/>

<!-- The drag gate only matters while a pointer drag is building a range;
     a node gap click sets a caret on pointer down and must show its insert
     tool instantly, without waiting for pointer up. -->
{#if floating_anchor && (!is_dragging || is_node_caret)}
	<!-- Re-mount the toolbar whenever the anchor changes: swapping
	     position-anchor on a persistent fixed element can leave it at the
	     stale position of the previous anchor. -->
	{#key `${floating_anchor.name}:${floating_anchor.placement}`}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="editor-toolbar floating-toolbar"
			class:anchor-below={floating_anchor.placement === 'below'}
			class:has-last-node-anchor={Boolean(floating_anchor.last_node_anchor)}
			style="position-anchor: --{floating_anchor.name};{floating_anchor.last_node_anchor
				? ` --last-selected-node-anchor: --${floating_anchor.last_node_anchor};`
				: ''}"
			onkeydown={handle_toolbar_keydown}
		>
			<div class="toolbar-scroller">
				<!-- Only the tools that belong to the current selection context: text
				     selections get text tools, node gaps just the insert button, node
				     and property selections the node tools. -->
				{#if selection_type === 'text'}
					{@render select_parent_button()}
					{@render mark_buttons()}
					<!-- No divider: the input belongs to the link tool right before it -->
					{#if show_link_input}
						{@render contextual_inputs()}
					{/if}
				{:else if is_node_caret}
					{@render insert_button()}
				{:else if selection_type === 'node'}
					{@render select_parent_button()}
					{@render node_mark_buttons()}
					<NodeNavigator {session} {focus_canvas} />
					{#if show_link_input}
						{@render divider()}
						{@render contextual_inputs()}
					{/if}
					{@render delete_button()}
				{:else if selection_type === 'property'}
					{@render select_parent_button()}
					<NodeNavigator {session} {focus_canvas} />
					{#if show_image_input}
						{@render divider()}
						{@render contextual_inputs()}
					{/if}
					{@render delete_button()}
				{/if}
			</div>
		</div>
	{/key}
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="editor-toolbar bottom-toolbar"
	style:--keyboard-inset="{keyboard_inset}px"
	onkeydown={handle_toolbar_keydown}
>
	<div class="toolbar-scroller">
		{#if editable}
			<!-- Same contextual composition as the floating toolbar: text tools for
			     text selections, just the insert button at node gaps, node tools for
			     node and property selections. -->
			<div class="contextual-tools">
				{#if selection_type === 'text'}
					{@render select_parent_button()}
					{@render mark_buttons()}
					<!-- No divider: the input belongs to the link tool right before it -->
					{#if show_link_input}
						{@render contextual_inputs()}
					{/if}
					{@render divider()}
				{:else if is_node_caret}
					{#if can_insert_default}
						{@render insert_button()}
						{@render divider()}
					{/if}
				{:else if selection_type === 'node'}
					{@render select_parent_button()}
					{@render node_mark_buttons()}
					<NodeNavigator {session} {focus_canvas} />
					{#if show_link_input}
						{@render divider()}
						{@render contextual_inputs()}
					{/if}
					{@render divider()}
				{:else if selection_type === 'property'}
					{@render select_parent_button()}
					<NodeNavigator {session} {focus_canvas} />
					{#if show_image_input}
						{@render divider()}
						{@render contextual_inputs()}
					{/if}
					{@render divider()}
				{/if}
			</div>
			{@render history_buttons()}
			{#if can_delete}
				<!-- Destructive action last, behind undo/redo: harder to hit by
				     accident while scrolling the bar, and undo sits right next to
				     it when it does happen. -->
				<div class="contextual-tools">
					{@render divider()}
					{@render delete_button()}
				</div>
			{/if}
		{/if}
		<!-- Save pinned to the right edge of the scroller so it never needs
		     scrolling. The custom hide-keyboard tool was removed: the native
		     iOS checkmark in the form assistant bar dismisses the keyboard,
		     and that bar cannot be suppressed from web content anyway. -->
		<div class="save-group" class:has-leading-tools={editable}>
			{#if editable}
				{@render divider()}
			{/if}
			<button class="toggle-editable" onclick={toggle_editable}>
				{editable ? 'Save' : 'Edit'}
			</button>
		</div>
	</div>
</div>

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
		color: var(--app-primary-text);
		background: var(--app-canvas-fill);
		border: 1px solid oklch(from var(--app-primary-text) l c h / 0.12);
		border-radius: 9999px;
		box-shadow:
			0 1px 2px oklch(0% 0 0 / 0.12),
			0 4px 16px oklch(0% 0 0 / 0.08);
		z-index: 50;
		pointer-events: auto;
		max-width: calc(100vw - 2 * var(--s-4));
	}

	.toolbar-scroller {
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

	.floating-toolbar.anchor-below {
		bottom: auto;
		top: anchor(bottom);
		margin-bottom: 0;
		margin-top: var(--s-2);
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

	.contextual-tools {
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
		background: var(--app-canvas-fill);
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
		background: oklch(from var(--app-primary-text) l c h / 0.15);
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
		color: var(--app-primary-text);
		text-wrap: nowrap;
		cursor: pointer;
		pointer-events: auto;
		transition:
			background 150ms,
			transform 150ms;
		outline: 1px solid transparent;
		--icon-color: var(--app-primary-text);
		position: relative;
	}

	/* Hover styles only on devices that actually hover, otherwise touch
	   browsers keep the emulated hover state stuck on a button after a tap. */
	@media (hover: hover) {
		.editor-toolbar button:not(.toggle-editable):hover:not(:disabled) {
			background: oklch(from var(--app-primary-text) l c h / 0.06);
		}
	}

	.editor-toolbar button:not(.toggle-editable):active:not(:disabled) {
		background: oklch(from var(--app-primary-text) l c h / 0.09);
		transform: translateY(1px) scale(0.95);
	}

	.editor-toolbar button:not(.toggle-editable):focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 1px var(--svedit-editing-stroke);
	}

	.editor-toolbar button:not(.toggle-editable):disabled {
		background: transparent;
		cursor: not-allowed;
		--icon-color: oklch(from var(--app-primary-text) l c h / 0.3);
	}

	/* Same translucent brand fill the text selection uses, so the active
	   state and the icon color always derive from one variable. */
	.editor-toolbar button:not(.toggle-editable).active {
		color: var(--svedit-editing-stroke);
		background: var(--svedit-editing-fill);
		--icon-color: var(--svedit-editing-stroke);
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
		background: var(--app-canvas-fill);
		/* Breathing room towards the neighboring tool lives outside the
		   group as margin: it keeps the divider flush with the opaque
		   background while pinned, so no white strip reads as a second line. */
		margin-inline-end: 4px;
	}

	.editor-toolbar .select-parent-group .divider {
		margin-inline-end: 0;
	}

	.toggle-editable {
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
		color: var(--svedit-editing-stroke);
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
		.toggle-editable:hover {
			background: oklch(from var(--svedit-editing-stroke) l c h / 0.08);
		}
	}

	.toggle-editable:active {
		background: oklch(from var(--svedit-editing-stroke) l c h / 0.12);
		transform: translateY(1px) scale(0.97);
	}

	.toggle-editable:focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 1px var(--svedit-editing-stroke);
	}

	.editor-toolbar .toolbar-icon {
		width: var(--icon-size, 24px);
		height: var(--icon-size, 24px);
		color: var(--icon-color, var(--app-primary-text));
	}

	.editor-toolbar .contextual-input {
		display: flex;
		align-items: center;
		gap: var(--s-2);

		label {
			display: flex;
			align-items: center;
			gap: var(--s-1);
			font-size: 14px;
			white-space: nowrap;
		}

		/* Flat inside the toolbar pill: no own border or background. Inputs
		   don't inherit the page font by default, so without font: inherit
		   this would render in the UA's system font. iOS Safari's focus zoom
		   on sub-16px inputs is prevented via maximum-scale=1 in app.html,
		   not by inflating the font size. */
		input {
			padding: var(--s-1) var(--s-2);
			border: none;
			background: transparent;
			color: var(--app-primary-text);
			font: inherit;
			font-size: 14px;
			/* Fixed width on purpose: field-sizing measures the placeholder
			   while empty and the content afterwards, so the bar would
			   visibly shrink on the first typed character. Long URLs scroll
			   within the field. */
			width: 9rem;
			max-width: var(--toolbar-item-max-width);

			&:focus {
				outline: none;
			}
		}
	}
</style>
