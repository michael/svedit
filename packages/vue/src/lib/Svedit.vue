<script setup lang="ts" generic="S extends DocumentSchema">
import {
	computed,
	inject,
	onBeforeUnmount,
	onMounted,
	provide,
	ref,
	toRaw,
	watch,
	watchEffect
} from 'vue';

import { check_duplicate_paths, remove_native_composition_text } from '@svedit/core';
import {
	get_selection_from_dom,
	render_selection,
	get_text_selection_from_dom
} from '@svedit/core';
import { handle_copy } from '@svedit/core';
import { handle_paste } from '@svedit/core';
import { create_node_visibility } from './node_visibility.js';
import DefaultNodeSelectionMarkers from './NodeSelectionMarkers.vue';
import './styles/svedit-colors.css';
import './styles/svedit-animations.css';

import type {
	DocumentSchema,
	Selection,
	TextSelection,
	DocumentPath,
	SveditContext
} from './types.js';
import type { KeyMapper, Keymap } from '@svedit/core';
import type Session from './Session.js';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
	defineProps<{
		/** The schema-typed session instance */
		session: Session<S>;
		/** The path to the root element (e.g. ['page_1']) */
		path: DocumentPath;
		/** The `autocapitalize` attribute on the canvas element */
		autocapitalize?: 'on' | 'off';
		/** The `spellcheck` attribute on the canvas element */
		spellcheck?: 'true' | 'false';
	}>(),
	{ autocapitalize: 'on', spellcheck: 'true' }
);

/** Determines wether the document should be editable or read-only. Two-way bindable. */
const editable = defineModel<boolean>('editable', { default: false });

const canvas_el = ref<HTMLElement>();
const root_node = computed(() => props.session.get(props.path));
const Overlays = computed(() => props.session.config.system_components?.overlays);
const NodeSelectionMarkers = computed(
	() =>
		props.session.config.system_components?.node_selection_markers ?? DefaultNodeSelectionMarkers
);
const RootComponent = computed(() => props.session.config.node_components[root_node.value.type]);

const is_composing = ref(false);
const canvas_focused = ref(false);
let before_composition_selection: TextSelection | null = null;
// Selection restoration and selection revealing are separate concerns.
// DOM changes (for example, toggling an annotation) can require rebuilding
// the native selection even when the logical selection did not move. Keep
// the last selection rendered while focused so those rebuilds do not also
// move the viewport.
let last_rendered_selection_snapshot: string | null = null;
// Set by onselectionchange before it commits a DOM-derived selection
// to the model. render_selection consumes-and-clears it to skip
// rerender on DOM-driven changes (the DOM is already in place).
let selection_source_is_dom = false;

// let is_mobile = computed(() => is_mobile_browser());
// let is_chrome_desktop = computed(() => is_chrome_desktop_browser());

const context: SveditContext<S> = {
	get session() {
		return props.session;
	},
	get editable() {
		return editable.value;
	},
	set editable(value) {
		editable.value = value;
	},
	get is_composing() {
		return is_composing.value;
	},
	get canvas_el() {
		return canvas_el.value;
	},
	get canvas_focused() {
		return canvas_focused.value;
	},
	focus_canvas
};

provide('svedit', context);
create_node_visibility(context);

/** Expose function so parent can call it */
defineExpose({ focus_canvas });

onMounted(() => {
	check_duplicate_paths(canvas_el.value);
});

// Get KeyMapper from context (may be undefined if not provided)
const key_mapper = inject<KeyMapper | undefined>('key_mapper', undefined);

// Initialize commands and keymap on the session. Runs after mount and
// re-runs when the session or its config changes.
watchEffect(
	() => {
		props.session.initialize_commands(context);
	},
	{ flush: 'post' }
);

function onbeforeinput(event: InputEvent) {
	// console.log(`onbeforeinput: ${event.inputType}, data: "${event.data}", isComposing: ${event.isComposing}`, event);
	const session = props.session;

	if (event.inputType === 'historyUndo' && is_composing.value) {
		// Let the historyundo event pass through (when triggered from within oncompositionend)
		return;
	}

	// Sometimes the part that should be replaced is not the same as the current DOM selection
	// that's why we look into event.getTargetRanges()[0] if it exists.
	let target_selection: TextSelection | null | undefined;
	if (event.getTargetRanges?.()?.[0]) {
		target_selection = get_text_selection_from_dom(event.getTargetRanges()[0]);
	}

	// While composing, Svedit does nothing and lets the oncompositionend
	// event handle the final replacement.
	if (event.isComposing) {
		// NOTE: We only capture the initial selection right after the composition started
		// We're not interested in the target selections during the composition.
		if (!before_composition_selection) {
			before_composition_selection = target_selection ?? null;
		}
		return;
	}

	// NOTE: in cases we can't reliably map event.getTargetRanges()[0] to a session selection,
	// the original session.selection is used.
	if (target_selection) {
		session.selection = target_selection;
	}

	// Only take input when in a valid text selection inside the canvas
	if (!canvas_el.value?.contains(document.activeElement)) {
		event.preventDefault();
		return;
	}

	if (event.inputType === 'formatBold' && session.selection?.type === 'text') {
		session.apply(session.tr.toggle_mark('strong'));
		event.preventDefault();
		event.stopPropagation();
	}

	if (event.inputType === 'formatItalic' && session.selection?.type === 'text') {
		session.apply(session.tr.toggle_mark('emphasis'));
		event.preventDefault();
		event.stopPropagation();
	}

	// NOTE: underline doesn't make much sense as a semantic mark,
	// so we rewire `cmd + u` to toggle highlights
	if (event.inputType === 'formatUnderline' && session.selection?.type === 'text') {
		session.apply(session.tr.toggle_mark('highlight'));
		event.preventDefault();
		event.stopPropagation();
	}

	if (['deleteContentBackward', 'deleteWordBackward', 'deleteContent'].includes(event.inputType)) {
		session.apply(session.tr.delete_selection('backward'));
		event.preventDefault();
		event.stopPropagation();
		return;
	}

	if (['deleteContentForward', 'deleteWordForward'].includes(event.inputType)) {
		session.apply(session.tr.delete_selection('forward'));
		event.preventDefault();
		event.stopPropagation();
		return;
	}

	// For now I reject drag+drop text movements.
	// TODO: If I want to support those, I need to handle them in such a way that
	// you can drag from one text property to another too.
	if (event.inputType === 'deleteByDrag' || event.inputType === 'insertFromDrop') {
		event.preventDefault();
		return;
	}

	// Insert the character, unless there is none.
	let inserted_text = event.data;

	// Sometimes (e.g. for replacements) the inserted_text is available via
	// event.dataTransfer, not event.data
	if (!inserted_text && event.dataTransfer) {
		inserted_text = event.dataTransfer?.getData('text/plain');
	}

	// Skip, if there's no inserted_text at all
	if (!inserted_text) {
		event.preventDefault();
		return;
	}

	const tr = session.tr;
	tr.insert_text(inserted_text);
	session.apply(tr, { batch: true });
	event.preventDefault();
}

/**
 * Handles composition start events for input methods like dead keys
 * This occurs when user starts typing a composed character (e.g., backtick for accents)
 */
function oncompositionstart(/*event*/) {
	// console.log('DEBUG: oncompositionstart', event.data);
	if (props.session.selection?.type !== 'text') {
		// Remove all ranges - completely clears the selection
		window.getSelection()?.removeAllRanges();

		// Restore
		setTimeout(() => {
			render_selection(props.session, canvas_el.value);
		}, 0);
		return;
	}

	// Disable keydown event handling during composition. This way, you can confirm
	// a diacritic (a->ä) with ENTER without causing a line break.
	if (key_mapper) key_mapper.skip_onkeydown = true;
	is_composing.value = true;
	return;
}

/**
 * Handles composition end events for input methods like dead keys
 * This occurs when composition is complete (e.g., after typing 'a' following backtick to get 'à')
 */
function oncompositionend(event: CompositionEvent) {
	// console.log('DEBUG: oncompositionend, insert:', event.data, event);
	const session = props.session;
	if (!canvas_el.value?.contains(document.activeElement)) return;
	if (session.selection?.type === 'text') {
		// We need to remember the user's selection, as it might have changed in the process
		// of finishing a composition. For instance, the user might have selected a different
		// part of the text while composing.
		const user_selection = get_selection_from_dom(session, canvas_el.value);

		// HACK: In order to restore the DOM state from before composition, we just run contenteditable's
		// native undo command. Then the DOM will be in sync again with the editor's internal state.
		document.execCommand('undo', false, null);

		// Firefox may not undo native composition DOM. If the composed text is
		// still present, remove it manually before applying the Svedit transaction.
		remove_native_composition_text(
			session,
			canvas_el.value,
			before_composition_selection,
			event.data
		);

		// Set the selection to where the user initiated the composition, make changes, and apply.
		// NOTE: We need to check for valid selection here, as there is a rare race condition
		// where the user had no text selection at the start of composition.
		if (before_composition_selection) {
			session.selection = before_composition_selection;
			// console.log('event.data', event.data);
			const tr = session.tr;
			tr.insert_text(event.data);
			session.apply(tr);
			// Recover user selection after composition. This assumes that document positions of natively
			// modified DOM (before transaction applied) are equal to the positions after the transaction.
			session.selection = user_selection;
		}

		// NOTE: We need a little timeout to nudge Safari into not handling the
		// ENTER press when confirming a diacritic
		setTimeout(() => {
			if (key_mapper) key_mapper.skip_onkeydown = false;
			is_composing.value = false;
		}, 100);
	}

	// Reset before_composition_selection, so we are ready for capturing the starting selection
	// of the next composition.
	before_composition_selection = null;
	return;
}

// Map DOM selection to internal model
function onselectionchange() {
	if (!editable.value) return;
	if (!canvas_focused.value) return;
	if (is_composing.value) return;
	const dom_selection = window.getSelection();
	if (!dom_selection.rangeCount) return;

	// Only handle selection changes if selection is within the canvas
	const range = dom_selection.getRangeAt(0);
	if (!canvas_el.value?.contains(range.commonAncestorContainer)) return;
	const selection = get_selection_from_dom(props.session, canvas_el.value);
	if (selection) {
		// Avoid assigning a new object reference when the selection is
		// structurally identical — prevents a redundant watcher cycle
		// (render_selection → scrollIntoView) on every DOM layout change.
		if (JSON.stringify(selection) === JSON.stringify(props.session.selection)) return;
		selection_source_is_dom = true;
		props.session.selection = selection;
	}
}

/**
 * @param event - The clipboard event
 * @param delete_selection - used by oncut()
 */
function oncopy(event: ClipboardEvent, delete_selection = false) {
	const session = props.session;
	// Only handle copy events if editable and focus is within the canvas
	if (!editable.value) return;
	if (!canvas_el.value?.contains(document.activeElement)) return;

	handle_copy(session, event, delete_selection);
}

function oncut(event: ClipboardEvent) {
	if (!editable.value) return;
	oncopy(event, true);
}

async function onpaste(event: ClipboardEvent) {
	const session = props.session;
	// Only handle paste events if editable and focus is within the canvas
	if (!editable.value) return;
	if (!canvas_el.value?.contains(document.activeElement)) return;
	await handle_paste(session, props.path, event);
}

// The keymap pushed on focus. Blur removes exactly this one: session.keymap
// may be reassigned while focused, and other scopes (e.g. a modal's) may
// have been pushed on top of it in the meantime.
let pushed_keymap: Keymap | null = null;

// Handle focus - push session's keymap onto stack.
// The focused state flips synchronously; Vue flushes the DOM update (e.g.
// removal of selection highlight spans) in the microtask right after this
// event handler, before the browser processes the click's selection.
function handle_canvas_focus() {
	canvas_focused.value = true;
	if (key_mapper && !pushed_keymap) {
		pushed_keymap = props.session.keymap;
		key_mapper.push_scope(pushed_keymap);
	}
}

// Handle blur - remove the document's keymap from the stack.
function handle_canvas_blur() {
	canvas_focused.value = false;
	if (key_mapper && pushed_keymap) {
		key_mapper.remove_scope(pushed_keymap);
		pushed_keymap = null;
	}
}

function focus_canvas() {
	canvas_focused.value = true;
	canvas_el.value?.focus();
}

// Whenever the model selection, the document (which may have rebuilt the DOM
// under an unchanged selection, e.g. an annotation toggle) or the canvas focus
// changes, render the selection. Runs after the DOM has been updated
// (flush: 'post').
// Skip when canvas is not focused to avoid stealing focus back
// (e.g., when a dialog is open and selection highlight fragments re-render).
// Consume the dom-driven flag at the top so it never carries stale
// state into the next change, even when we early-return.
watch(
	[() => props.session.selection, () => props.session.doc, canvas_focused],
	() => {
		const dom_driven = selection_source_is_dom;
		selection_source_is_dom = false;
		if (!canvas_focused.value) return;
		const selection_snapshot = JSON.stringify(props.session.selection);
		const should_scroll_selection_into_view =
			!dom_driven && selection_snapshot !== last_rendered_selection_snapshot;
		render_selection(props.session, canvas_el.value, dom_driven, should_scroll_selection_into_view);
		last_rendered_selection_snapshot = selection_snapshot;
	},
	{ flush: 'post' }
);

// TODO: We must get rid of the global handlers here, so Svedit doesn't conflict
// with any app-specific event handling.
onMounted(() => {
	document.addEventListener('selectionchange', onselectionchange);
	document.addEventListener('cut', oncut);
	document.addEventListener('copy', oncopy);
	document.addEventListener('paste', onpaste);
});

onBeforeUnmount(() => {
	document.removeEventListener('selectionchange', onselectionchange);
	document.removeEventListener('cut', oncut);
	document.removeEventListener('copy', oncopy);
	document.removeEventListener('paste', onpaste);
});
</script>

<!-- TODO: move oncut/copy/paste handlers inside .svedit -->
<template>
	<div class="svedit" :class="{ editable }">
		<!-- Overlays must be before canvas so they initialize first. -->
		<component :is="NodeSelectionMarkers" v-if="editable" />
		<component :is="Overlays" v-if="Overlays" />
		<!--
			inputmode is derived from the model selection: when a custom property
			(image, embed, etc.) is selected, set inputmode="none" so iOS does
			not open the virtual keyboard. For any other selection (text, node,
			none), allow the keyboard via inputmode="text". The browser's native
			selection-change flow updates session.selection on tap, which flips
			this attribute before iOS decides whether to show the keyboard — no
			imperative state tracking, drag detection, or click/pointerdown
			handlers are required for keyboard suppression.
		-->
		<div
			ref="canvas_el"
			class="svedit-canvas"
			:class="[
				$attrs.class,
				{
					'hide-selection': editable && session.selection?.type === 'node',
					'node-caret':
						session.selection?.type === 'node' &&
						session.selection.anchor_offset === session.selection.focus_offset,
					'property-selection': session.selection?.type === 'property'
				}
			]"
			:inputmode="session.selection?.type === 'text' ? 'text' : 'none'"
			:contenteditable="editable ? 'true' : 'false'"
			tabindex="-1"
			:autocapitalize="autocapitalize"
			:spellcheck="spellcheck"
			@beforeinput="onbeforeinput"
			@compositionstart="oncompositionstart"
			@compositionend="oncompositionend"
			@focus="handle_canvas_focus"
			@blur="handle_canvas_blur"
		>
			<component :is="RootComponent" :path="path" />
		</div>
	</div>
</template>

<style scoped>
.svedit-canvas {
	caret-color: var(--editing);
	caret-shape: bar;
	/* Default to vertical/ column flow with: --row: 0; (the most common case)
		Prevents silent failures when developers forget to set the row property in their top level node component.
		TODO: Warn developers in dev mode via console if they forget to set the --row property and use a different flow.*/
	--row: 0;
}
.svedit-canvas:focus {
	outline: none;
}

@media not (pointer: coarse) {
	.svedit-canvas.hide-selection {
		caret-color: transparent;
	}
}

/* When the caret is in a node gap we never want to see the caret */
.svedit-canvas.node-caret,
.svedit-canvas.property-selection {
	caret-color: transparent;
}
</style>

<style>
/* Selection paint — wrapped in :where() so consumers can override with
	   a plain `::selection` rule. Final specificity is just (0,0,1),
	   trivially beatable. */
:where(.svedit-canvas) ::selection {
	background: var(--editing-muted);
}

@media not (pointer: coarse) {
	@supports (anchor-name: --test) {
		.svedit-canvas.hide-selection ::selection {
			background: transparent;
		}
	}
}
</style>
