<script lang="ts" generics="S extends DocumentSchema">
	import { flushSync, getContext, setContext } from 'svelte';

	import { check_duplicate_paths, remove_native_composition_text } from '@svedit/core';
	import {
		get_selection_from_dom,
		render_selection,
		get_text_selection_from_dom
	} from '@svedit/core';
	import { handle_copy } from '@svedit/core';
	import { handle_paste } from '@svedit/core';
	import { create_node_visibility } from './node_visibility.svelte.js';
	import DefaultNodeSelectionMarkers from './NodeSelectionMarkers.svelte';
	import './styles/svedit-colors.css';
	import './styles/svedit-animations.css';

	import type { DocumentSchema, SveditProps, TextSelection } from './types.js';
	import type { KeyMapper, Keymap } from '@svedit/core';

	let {
		session,
		editable = $bindable(false),
		path,
		class: css_class,
		autocapitalize = 'on',
		spellcheck = 'true'
	}: SveditProps<S> = $props();

	let canvas_el: HTMLElement | undefined;
	let root_node = $derived(session.get(path));
	let Overlays = $derived(session.config.system_components?.overlays);
	let NodeSelectionMarkers = $derived(
		session.config.system_components?.node_selection_markers ?? DefaultNodeSelectionMarkers
	);
	let RootComponent = $derived(session.config.node_components[root_node.type]);

	let is_composing = $state(false);
	let canvas_focused = $state(false);
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

	// let is_mobile = $derived(is_mobile_browser());
	// let is_chrome_desktop = $derived(is_chrome_desktop_browser());

	/** Expose function so parent can call it */
	export { focus_canvas };

	const context = {
		get session() {
			return session;
		},
		get editable() {
			return editable;
		},
		set editable(value) {
			editable = value;
		},
		get is_composing() {
			return is_composing;
		},
		get canvas_el() {
			return canvas_el;
		},
		get canvas_focused() {
			return canvas_focused;
		},
		focus_canvas
	};

	setContext('svedit', context);
	create_node_visibility(context);

	$effect(() => {
		check_duplicate_paths(canvas_el);
	});

	// Get KeyMapper from context (may be undefined if not provided)
	const key_mapper = getContext<KeyMapper>('key_mapper');

	// Initialize commands and keymap on the session
	$effect(() => {
		session.initialize_commands(context);
	});

	/**
	 * @param {InputEvent} event
	 */
	async function onbeforeinput(event: InputEvent) {
		// console.log(`onbeforeinput: ${event.inputType}, data: "${event.data}", isComposing: ${event.isComposing}`, event);

		if (event.inputType === 'historyUndo' && is_composing) {
			// Let the historyundo event pass through (when triggered from within oncompositionend)
			return;
		}

		// Sometimes the part that should be replaced is not the same as the current DOM selection
		// that's why we look into event.getTargetRanges()[0] if it exists.
		let target_selection;
		if (event.getTargetRanges?.()?.[0]) {
			target_selection = get_text_selection_from_dom(event.getTargetRanges()[0]);
		}

		// While composing, Svedit does nothing and lets the oncompositionend
		// event handle the final replacement.
		if (event.isComposing) {
			// NOTE: We only capture the initial selection right after the composition started
			// We're not interested in the target selections during the composition.
			if (!before_composition_selection) {
				before_composition_selection = target_selection;
			}
			return;
		}

		// NOTE: in cases we can't reliably map event.getTargetRanges()[0] to a session selection,
		// the original session.selection is used.
		if (target_selection) {
			session.selection = target_selection;
		}

		// Only take input when in a valid text selection inside the canvas
		if (!canvas_el?.contains(document.activeElement)) {
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

		if (
			['deleteContentBackward', 'deleteWordBackward', 'deleteContent'].includes(event.inputType)
		) {
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
		if (session.selection.type !== 'text') {
			// Remove all ranges - completely clears the selection
			window.getSelection()?.removeAllRanges();

			// Restore
			setTimeout(() => {
				render_selection(session, canvas_el);
			}, 0);
			return;
		}

		// Disable keydown event handling during composition. This way, you can confirm
		// a diacritic (a->ä) with ENTER without causing a line break.
		key_mapper.skip_onkeydown = true;
		is_composing = true;
		return;
	}

	/**
	 * Handles composition end events for input methods like dead keys
	 * This occurs when composition is complete (e.g., after typing 'a' following backtick to get 'à')
	 */
	function oncompositionend(event: CompositionEvent) {
		// console.log('DEBUG: oncompositionend, insert:', event.data, event);
		if (!canvas_el?.contains(document.activeElement)) return;
		if (session.selection?.type === 'text') {
			// We need to remember the user's selection, as it might have changed in the process
			// of finishing a composition. For instance, the user might have selected a different
			// part of the text while composing.
			const user_selection = get_selection_from_dom(session, canvas_el);

			// HACK: In order to restore the DOM state from before composition, we just run contenteditable's
			// native undo command. Then the DOM will be in sync again with the editor's internal state.
			document.execCommand('undo', false, null);

			// Firefox may not undo native composition DOM. If the composed text is
			// still present, remove it manually before applying the Svedit transaction.
			remove_native_composition_text(session, canvas_el, before_composition_selection, event.data);

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
				key_mapper.skip_onkeydown = false;
				is_composing = false;
			}, 100);
		}

		// Reset before_composition_selection, so we are ready for capturing the starting selection
		// of the next composition.
		before_composition_selection = null;
		return;
	}

	// Map DOM selection to internal model
	function onselectionchange() {
		if (!editable) return;
		if (!canvas_focused) return;
		if (is_composing) return;
		const dom_selection = window.getSelection();
		if (!dom_selection.rangeCount) return;

		// Only handle selection changes if selection is within the canvas
		const range = dom_selection.getRangeAt(0);
		if (!canvas_el?.contains(range.commonAncestorContainer)) return;
		let selection = get_selection_from_dom(session, canvas_el);
		if (selection) {
			// Avoid assigning a new object reference when the selection is
			// structurally identical — prevents a redundant $effect cycle
			// (render_selection → scrollIntoView) on every DOM layout change.
			if (JSON.stringify(selection) === JSON.stringify(session.selection)) return;
			selection_source_is_dom = true;
			session.selection = selection;
		}
	}

	/**
	 * @param {ClipboardEvent} event
	 * @param {boolean} delete_selection - used by oncut()
	 */
	function oncopy(event: ClipboardEvent, delete_selection = false) {
		// Only handle copy events if editable and focus is within the canvas
		if (!editable) return;
		if (!canvas_el?.contains(document.activeElement)) return;

		handle_copy(session, event, delete_selection);
	}

	function oncut(event: ClipboardEvent) {
		if (!editable) return;
		oncopy(event, true);
	}

	async function onpaste(event: ClipboardEvent) {
		// Only handle paste events if editable and focus is within the canvas
		if (!editable) return;
		if (!canvas_el?.contains(document.activeElement)) return;
		await handle_paste(session, path, event);
	}

	// The keymap pushed on focus. Blur removes exactly this one: session.keymap
	// may be reassigned while focused, and other scopes (e.g. a modal's) may
	// have been pushed on top of it in the meantime.
	let pushed_keymap: Keymap | null = null;

	// Handle focus - push session's keymap onto stack
	function handle_canvas_focus() {
		// Use flushSync so highlight spans are removed from the DOM
		// immediately, before the browser processes the click's selection.
		flushSync(() => {
			canvas_focused = true;
		});
		if (key_mapper && !pushed_keymap) {
			pushed_keymap = session.keymap;
			key_mapper.push_scope(pushed_keymap);
		}
	}

	// Handle blur - remove the document's keymap from the stack.
	function handle_canvas_blur() {
		// Use flushSync so the selection highlight span (with its CSS anchor)
		// is in the DOM immediately, before any popover/dialog tries to
		// position itself.
		flushSync(() => {
			canvas_focused = false;
		});
		if (key_mapper && pushed_keymap) {
			key_mapper.remove_scope(pushed_keymap);
			pushed_keymap = null;
		}
	}

	function focus_canvas() {
		// Use flushSync so highlight spans are removed from the DOM
		// immediately, before we focus and render_selection walks the
		// text nodes.
		flushSync(() => {
			canvas_focused = true;
		});
		canvas_el?.focus();
	}

	// Whenever the model selection or the document changes, render the
	// selection. The document is read too: a transaction may rebuild the DOM
	// under an unchanged selection (e.g. an annotation toggle).
	// Skip when canvas is not focused to avoid stealing focus back
	// (e.g., when a dialog is open and selection highlight fragments re-render).
	// Consume the dom-driven flag at the top so it never carries stale
	// state into the next change, even when we early-return.
	$effect(() => {
		session.selection;
		session.doc;
		const dom_driven = selection_source_is_dom;
		selection_source_is_dom = false;
		if (!canvas_focused) return;
		const selection_snapshot = JSON.stringify(session.selection);
		const should_scroll_selection_into_view =
			!dom_driven && selection_snapshot !== last_rendered_selection_snapshot;
		render_selection(session, canvas_el, dom_driven, should_scroll_selection_into_view);
		last_rendered_selection_snapshot = selection_snapshot;
	});
</script>

<!--
  TODO: We must get rid of the global handlers here, so Svedit doesn't conflict
  with any app-specific event handling.
-->
<svelte:document {onselectionchange} {oncut} {oncopy} {onpaste} />

<!-- TODO: move oncut/copy/paste handlers inside .svedit -->
<div class="svedit" class:editable>
	<!-- Overlays must be before canvas so they initialize first. -->
	{#if editable}<NodeSelectionMarkers />{/if}
	{#if Overlays}<Overlays />{/if}
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
		class="svedit-canvas {css_class}"
		class:hide-selection={editable && session.selection?.type === 'node'}
		class:node-caret={session.selection?.type === 'node' &&
			session.selection.anchor_offset === session.selection.focus_offset}
		class:property-selection={session.selection?.type === 'property'}
		bind:this={canvas_el}
		{onbeforeinput}
		{oncompositionstart}
		{oncompositionend}
		onfocus={handle_canvas_focus}
		onblur={handle_canvas_blur}
		inputmode={session.selection?.type === 'text' ? 'text' : 'none'}
		contenteditable={editable ? 'true' : 'false'}
		tabindex="-1"
		{autocapitalize}
		{spellcheck}
		{...{
			// NOTE: Autocomplete and autocorrect make immense troubles
			// on Desktop Chrome, so we disable them only for Chrome desktop.
			// Additionally, OSX-native auto-complete also breaks, because
			// I'm using a keyed block that always wipes the DOM of a text node
			// on every change.
			// autocomplete: is_chrome_desktop ? "off" : "on",
			// autocorrect: is_chrome_desktop ? "off" : "on"
		}}
	>
		<RootComponent {path} />
	</div>
</div>

<style>
	.svedit-canvas {
		caret-color: var(--editing);
		caret-shape: bar;
		/* Default to vertical/ column flow with: --row: 0; (the most common case)
		Prevents silent failures when developers forget to set the row property in their top level node component.
		TODO: Warn developers in dev mode via console if they forget to set the --row property and use a different flow.*/
		--row: 0;
		&:focus {
			outline: none;
		}
	}

	/* Selection paint — wrapped in :where() so consumers can override with
	   a plain `::selection` rule. Svelte still adds the scope hash inside
	   the :where(), but the wrapper zeroes its specificity contribution.
	   Final specificity is just (0,0,1), trivially beatable. */
	:where(.svedit-canvas) :global(::selection) {
		background: var(--editing-muted);
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

	@media not (pointer: coarse) {
		@supports (anchor-name: --test) {
			.svedit-canvas.hide-selection :global(::selection) {
				background: transparent;
			}
		}
	}
</style>
