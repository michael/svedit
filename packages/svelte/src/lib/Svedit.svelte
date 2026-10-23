<script lang="ts" generics="S extends DocumentSchema">
	import { flushSync, getContext, setContext } from 'svelte';

	import { CanvasController, check_duplicate_paths } from '@svedit/core';
	import { create_node_visibility } from './node_visibility.svelte.js';
	import DefaultNodeSelectionMarkers from './NodeSelectionMarkers.svelte';
	import './styles/svedit-colors.css';
	import './styles/svedit-animations.css';

	import type { DocumentSchema, SveditProps } from './types.js';
	import type { KeyMapper } from '@svedit/core';

	/**
	 * The editor component: renders the document root inside a
	 * contenteditable canvas. Input, composition, clipboard and selection
	 * handling live in the shared `CanvasController` from @svedit/core; this
	 * component owns the reactive state (editable, canvas focus,
	 * composition) and tells the controller when to render the selection.
	 */
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

	// Get KeyMapper from context (may be undefined if not provided)
	const key_mapper = getContext<KeyMapper | undefined>('key_mapper');

	const controller = new CanvasController<S>({
		get session() {
			return session;
		},
		get path() {
			return path;
		},
		get canvas_el() {
			return canvas_el;
		},
		get editable() {
			return editable;
		},
		get is_composing() {
			return is_composing;
		},
		get canvas_focused() {
			return canvas_focused;
		},
		key_mapper,
		set_is_composing(value) {
			is_composing = value;
		},
		set_canvas_focused(value) {
			// flushSync, so selection highlight spans are removed from (or added
			// to) the DOM immediately: before the browser processes a click's
			// selection on focus, before render_selection walks the text nodes,
			// and before a popover positions itself against the highlight on blur.
			flushSync(() => {
				canvas_focused = value;
			});
		}
	});

	/** Expose function so parent can call it */
	export const focus_canvas = controller.focus_canvas;

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

	// Document-level selectionchange and clipboard listeners. The cleanup also
	// removes a keymap still pushed: destroying the editor while focused
	// (route change, {#key} remount) must not leave it on the app's stack.
	$effect(() => controller.listen());

	// Initialize commands and keymap on the session
	$effect(() => {
		session.initialize_commands(context);
	});

	// Whenever the model selection, the document or the canvas focus changes,
	// render the selection. The document is read too: a transaction may
	// rebuild the DOM under an unchanged selection (e.g. an annotation toggle).
	$effect(() => {
		session.selection;
		session.doc;
		canvas_focused;
		controller.sync_selection();
	});
</script>

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
		onbeforeinput={controller.onbeforeinput}
		oncompositionstart={controller.oncompositionstart}
		oncompositionend={controller.oncompositionend}
		onfocus={controller.onfocus}
		onblur={controller.onblur}
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
