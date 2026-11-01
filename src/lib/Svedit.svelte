<script lang="ts" generics="S extends DocumentSchema">
	import { flushSync, getContext, setContext, untrack } from 'svelte';
	import { copy_selection, paste } from './clipboard.js';
	import {
		read_selection,
		read_text_selection,
		write_selection,
		selections_equal,
		remove_native_composition_text
	} from './dom_selection.js';
	import { create_node_visibility } from './node_visibility.svelte.js';
	import DefaultNodeSelectionMarkers from './NodeSelectionMarkers.svelte';
	import './styles/svedit-colors.css';
	import './styles/svedit-animations.css';
	import type { DocumentSchema, SveditProps, TextSelection } from './types.js';
	import type { KeyMapper } from './KeyMapper.svelte.js';

	let {
		session,
		editable = $bindable(false),
		path,
		class: css_class,
		autocapitalize = 'on',
		spellcheck = 'true'
	}: SveditProps<S> = $props();

	const MARK_INPUT_TYPES: Record<string, string> = {
		formatBold: 'strong',
		formatItalic: 'emphasis',
		// Underline makes little sense as a semantic mark, so cmd+u toggles highlights
		formatUnderline: 'highlight'
	};
	const DELETE_INPUT_TYPES: Record<string, 'backward' | 'forward'> = {
		deleteContentBackward: 'backward',
		deleteWordBackward: 'backward',
		deleteContent: 'backward',
		deleteContentForward: 'forward',
		deleteWordForward: 'forward'
	};

	let canvas_el: HTMLElement | undefined;
	let root_node = $derived(session.get(path));
	let RootComponent = $derived(session.config.node_components[root_node.type]);
	let Overlays = $derived(session.config.system_components?.overlays);
	let NodeSelectionMarkers = $derived(
		session.config.system_components?.node_selection_markers ?? DefaultNodeSelectionMarkers
	);
	let is_composing = $state(false);
	let canvas_focused = $state(false);
	let before_composition_selection: TextSelection | null = null;
	// Rebuilding the native selection (e.g. after toggling an annotation)
	// must not move the viewport unless the logical selection moved.
	let last_rendered_selection: string | null = null;
	// Set when a selection change comes from the DOM, which is already in place
	let selection_source_is_dom = false;

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

	// Optional, provided by the app
	const key_mapper = getContext<KeyMapper | undefined>('key_mapper');

	$effect(() => {
		session.initialize_commands(context);
	});

	// Each path may be mounted once per document; shared content needs distinct node arrays
	$effect(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local set.
		const mounted = new Set<string>();
		for (const el of canvas_el?.querySelectorAll('[data-path]') ?? []) {
			const path_str = el.getAttribute('data-path')!;
			if (el.closest('.svedit-canvas') !== canvas_el) continue;
			if (mounted.has(path_str)) {
				console.warn(
					`[svedit] Path "${path_str}" is mounted more than once. Within a single Svedit document, each path may be mounted exactly once. To render shared content in multiple places (e.g. header + footer nav), use distinct node_arrays or separate Svedit instances.`
				);
			}
			mounted.add(path_str);
		}
	});

	const is_focus_inside = () => !!canvas_el?.contains(document.activeElement);

	function prevent(event: Event) {
		event.preventDefault();
		event.stopPropagation();
	}

	function onbeforeinput(event: InputEvent) {
		// Let the native undo through that oncompositionend triggers
		if (event.inputType === 'historyUndo' && is_composing) return;

		// The replaced part may differ from the DOM selection (e.g. autocorrect)
		const target_range = event.getTargetRanges?.()?.[0];
		const target_selection = target_range ? read_text_selection(target_range) : null;

		// While composing, only remember where the composition started;
		// oncompositionend makes the final replacement
		if (event.isComposing) {
			before_composition_selection ??= target_selection;
			return;
		}
		if (target_selection) session.selection = target_selection;
		if (!is_focus_inside()) return event.preventDefault();

		const mark_type = MARK_INPUT_TYPES[event.inputType];
		if (mark_type && session.selection?.type === 'text') {
			session.apply(session.tr.toggle_mark(mark_type));
			return prevent(event);
		}
		const direction = DELETE_INPUT_TYPES[event.inputType];
		if (direction) {
			session.apply(session.tr.delete_selection(direction));
			return prevent(event);
		}
		event.preventDefault();
		// Drag and drop text movements are not supported
		if (event.inputType === 'deleteByDrag' || event.inputType === 'insertFromDrop') return;
		// Replacements may carry their text in dataTransfer
		const text = event.data || event.dataTransfer?.getData('text/plain');
		if (text) session.apply(session.tr.insert_text(text), { batch: true });
	}

	/** Composition (e.g. dead keys for accents) starts */
	function oncompositionstart() {
		if (session.selection?.type !== 'text') {
			window.getSelection()?.removeAllRanges();
			setTimeout(() => render_selection(), 0);
			return;
		}
		// So Enter can confirm a composition without breaking the line
		if (key_mapper) key_mapper.skip_onkeydown = true;
		is_composing = true;
	}

	/** Composition (e.g. 'à' after a backtick) is complete */
	function oncompositionend(event: CompositionEvent) {
		if (!is_focus_inside()) return;
		if (session.selection?.type === 'text' && canvas_el) {
			// The user may have moved the selection while composing
			const user_selection = read_selection(session, canvas_el);
			// HACK: The native undo restores the DOM from before the composition,
			// so it is in sync with the model again. Firefox may not undo it.
			document.execCommand('undo', false, null);
			remove_native_composition_text(session, canvas_el, before_composition_selection, event.data);
			if (before_composition_selection) {
				session.selection = before_composition_selection;
				session.apply(session.tr.insert_text(event.data));
				// Assumes the DOM positions are unchanged by the transaction
				session.selection = user_selection;
			}
			// A little timeout keeps Safari from handling the Enter that confirmed a diacritic
			setTimeout(() => {
				if (key_mapper) key_mapper.skip_onkeydown = false;
				is_composing = false;
			}, 100);
		}
		before_composition_selection = null;
	}

	/** Map the DOM selection to the model */
	function onselectionchange() {
		if (!editable || !canvas_focused || is_composing || !canvas_el) return;
		const dom_selection = window.getSelection();
		if (
			!dom_selection?.rangeCount ||
			!canvas_el.contains(dom_selection.getRangeAt(0).commonAncestorContainer)
		)
			return;
		const selection = read_selection(session, canvas_el);
		// An unchanged selection is not reassigned, to avoid a needless rerender
		if (!selection || selections_equal(selection, session.selection)) return;
		selection_source_is_dom = true;
		session.selection = selection;
	}

	function oncopy(event: ClipboardEvent, delete_selection = false) {
		if (!editable || !is_focus_inside()) return;
		prevent(event);
		copy_selection(session, event.clipboardData);
		if (delete_selection) session.apply(session.tr.delete_selection());
	}

	function oncut(event: ClipboardEvent) {
		oncopy(event, true);
	}

	function onpaste(event: ClipboardEvent) {
		if (!editable || !is_focus_inside()) return;
		event.preventDefault();
		paste(session, event.clipboardData, path);
	}

	function render_selection(dom_driven = false, scroll = true) {
		const selection = session.selection;
		// Without a model selection the DOM selection is left alone, since
		// clearing it loses the selection when the window is refocused
		if (!selection || !canvas_el) return;
		// A DOM-driven change is already in place. Model-driven changes always
		// rerender, as the DOM can match by coincidence (reused gap elements).
		if (dom_driven && is_focus_inside()) {
			const is_empty_text =
				selection.type === 'text' && session.get(selection.path).content.length === 0;
			if (!is_empty_text && selections_equal(selection, read_selection(session, canvas_el))) return;
		}
		write_selection(session, canvas_el, selection, scroll);
	}

	// flushSync removes or renders selection highlight spans immediately:
	// before the browser processes a click's selection on focus, and before a
	// popover anchors itself to the highlight on blur.
	function handle_canvas_focus() {
		flushSync(() => (canvas_focused = true));
		key_mapper?.push_scope(session.keymap);
	}

	function handle_canvas_blur() {
		flushSync(() => (canvas_focused = false));
		key_mapper?.pop_scope();
	}

	function focus_canvas() {
		flushSync(() => (canvas_focused = true));
		canvas_el?.focus();
	}

	// Render the model selection whenever it (or the document) changes. Not
	// while blurred, which would steal focus back (e.g. from a dialog).
	$effect(() => {
		const selection = session.selection;
		void session.doc;
		const dom_driven = selection_source_is_dom;
		selection_source_is_dom = false;
		if (!canvas_focused) return;
		const snapshot = JSON.stringify(selection);
		untrack(() =>
			render_selection(dom_driven, !dom_driven && snapshot !== last_rendered_selection)
		);
		last_rendered_selection = snapshot;
	});
</script>

<!-- TODO: Global handlers can conflict with app-specific event handling -->
<svelte:document {onselectionchange} {oncut} {oncopy} {onpaste} />

<div class="svedit" class:editable>
	<!-- Overlays must be before canvas so they initialize first. -->
	{#if editable}<NodeSelectionMarkers />{/if}
	{#if Overlays}<Overlays />{/if}
	<!--
		inputmode follows the model selection: for custom property and node
		gap selections it is "none", so iOS does not open the virtual
		keyboard. With a text selection, or no selection yet, it is "text":
		iOS 27 Safari decides on the keyboard from the inputmode at the time
		the tap focuses the canvas, so a fresh document needs "text" for the
		first tap into text to open the keyboard.
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
		inputmode={session.selection && session.selection.type !== 'text' ? 'none' : 'text'}
		contenteditable={editable ? 'true' : 'false'}
		tabindex="-1"
		{autocapitalize}
		{spellcheck}
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
