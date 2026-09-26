<script lang="ts">
	import { getContext } from 'svelte';
	import {
		char_slice,
		get_char_length,
		paths_equal,
		serialize_path,
		get_selection_range,
		calculate_fragment_ranges
	} from './utils.js';

	import type {
		TextPropertyProps,
		Mark,
		Fragment,
		InlineFragment,
		SelectionRange,
		SveditContext
	} from './types.js';

	const svedit = getContext<SveditContext>('svedit');

	let {
		path,
		class: css_class,
		placeholder = '',
		tag = 'div',
		style = '',
		...rest
	}: TextPropertyProps = $props();

	let path_str = $derived(serialize_path(path));

	let is_focused = $derived.by(() => {
		return (
			svedit.session.selection?.type === 'text' && paths_equal(path, svedit.session.selection.path)
		);
	});

	let plain_text = $derived(svedit.session.get(path).content);
	// A string has zero grapheme clusters iff it has zero code units, so a
	// plain length check avoids a full Intl.Segmenter pass (this derived
	// re-runs for every text property on every document change).
	let is_empty = $derived(plain_text.length === 0 && !(svedit.is_composing && is_focused));

	let is_collapsed = $derived.by(() => {
		const selection = svedit.session.selection;
		return (
			is_focused && selection?.type === 'text' && selection.anchor_offset === selection.focus_offset
		);
	});

	// Get selection highlight range if it does not touch marks.
	// Only render selection highlight when canvas is NOT focused.
	// This avoids DOM mutations (splitting text nodes for highlight spans)
	// while the user is actively selecting, which would cause selection
	// feedback loops and scroll-to-focus issues.
	let selection_highlight_range = $derived.by(() => {
		if (svedit.canvas_focused) return null;
		if (is_collapsed) return null;
		if (!is_focused) return null;
		if (svedit.session.selected_marks.length > 0) return null;
		const sel = svedit.session.selection;
		if (!sel || sel.type !== 'text') return null;
		return get_selection_range(sel);
	});

	let fragments = $derived(
		get_fragments(
			svedit.session.get(path).content,
			svedit.session.get(path).marks,
			selection_highlight_range
		)
	);

	/**
	 * Converts text with marks into renderable fragments for display.
	 * Annotations never fragment the text; they are data-only.
	 */
	function get_fragments(
		text: string,
		marks: Array<Mark>,
		selection_highlight_range?: SelectionRange | null
	): Array<Fragment> {
		// Fast path: no marks and no selection highlight means the whole text
		// is a single content fragment. This runs for EVERY text property on
		// EVERY document change, so skipping the two full Intl.Segmenter passes
		// (get_char_length + char_slice over the whole text) matters at scale.
		if (marks.length === 0 && !selection_highlight_range) {
			return text.length > 0 ? [text] : [];
		}

		const ranges = calculate_fragment_ranges(
			get_char_length(text),
			marks,
			selection_highlight_range
		);
		const fragments: Array<Fragment> = [];

		for (const range of ranges) {
			const content = char_slice(text, range.start_offset, range.end_offset);

			if (range.type === 'mark') {
				const node = svedit.session.get(range.node_id);
				if (!node) throw new Error(`Node not found for mark ${range.node_id}`);

				// Inline nodes are stored as one-character marks but render as
				// atomic content, not as marked-up text, so they get their own
				// fragment type and their placeholder character is dropped.
				if (svedit.session.kind(node) === 'inline') {
					fragments.push({
						type: 'inline',
						node,
						mark_index: range.mark_index!,
						start_offset: range.start_offset
					});
				} else {
					fragments.push({
						type: 'mark',
						node,
						content,
						mark_index: range.mark_index!
					});
				}
			} else if (range.type === 'selection_highlight') {
				fragments.push({
					type: 'selection_highlight',
					content
				});
			} else {
				fragments.push(content);
			}
		}

		return fragments;
	}

	/**
	 * True when the current selection covers the inline node's single
	 * character.
	 *
	 * Inline node wrappers set `user-select: none`, so the browser never
	 * paints a native selection over them — the component has to be told.
	 */
	function is_inline_selected(fragment: InlineFragment): boolean {
		const selection = svedit.session.selection;
		if (!selection || selection.type !== 'text') return false;
		if (!paths_equal(path, selection.path)) return false;
		const range = get_selection_range(selection);
		if (!range) return false;
		return (
			range.start_offset <= fragment.start_offset && range.end_offset >= fragment.start_offset + 1
		);
	}
</script>

<!-- ATTENTION: The comments are needed to prevent unwanted text nodes with whitespace. -->
<!-- We need to use <br> so the element is reachable by Arrow Up/Down navigation. -->
<!-- But as soon as the element is focused, we get rid of the <br> as it causes issues with caret positioning. -->
<!-- Before, we were just hiding it on focus, but that caused the caret to disappear on Safari Desktop (tested with v26). -->
<!-- Edge Case: Shift Enter stops working if <br> is not present on a non-empty text property. -->
<svelte:element
	this={tag}
	data-type="text"
	data-path={path_str}
	style="anchor-name: --{path_str};{style}"
	class="text svedit-selectable {css_class}"
	class:empty={is_empty}
	class:focused={is_focused}
	{placeholder}
	{...rest}
>
	{#each fragments as fragment, index (index)}
		{#if typeof fragment === 'string'}{fragment}{:else if fragment.type === 'selection_highlight'}<span
				class="selection-highlight"
				style="anchor-name: --selection-highlight;">{fragment.content}</span
			>{:else if fragment.type === 'mark'}
			{@const MarkComponent = svedit.session.config.node_components[fragment.node.type]}
			{#if MarkComponent}
				<MarkComponent
					path={[...path, 'marks', fragment.mark_index, 'node_id']}
					content={fragment.content}
				/>
			{:else}<span class="mark-{fragment.node.type}">{fragment.content}</span>{/if}
		{:else if fragment.type === 'inline'}
			{@const InlineComponent = svedit.session.config.node_components[fragment.node.type]}
			{@const inline_path = [...path, 'marks', fragment.mark_index, 'node_id']}
			{@const inline_selected = is_inline_selected(fragment)}<span
				data-type="inline-node"
				data-node-id={fragment.node.id}
				data-offset={fragment.start_offset}
				contenteditable="false"
				class="svedit-inline-node"
				class:selected={inline_selected}
				style="anchor-name: --{serialize_path(inline_path)}"
				><InlineComponent path={inline_path} selected={inline_selected} /></span
			>
		{/if}
	{/each}<!--
  -->{#if !is_focused || !is_empty}<br />{/if}
</svelte:element>

<style>
	/* An inline node is atomic: one model character, arbitrary rendered content.
	   user-select: none stops the browser painting a partial native selection
	   across it — TextProperty passes a `selected` prop to the component
	   instead. pointer-events on descendants is off so a click always resolves
	   to the wrapper, which is what Svedit's pointerdown handler looks for.
	   Both are in :where() so applications can override them. */
	:where(.svedit-inline-node) {
		display: inline-block;
		white-space: nowrap;
		user-select: none;
	}

	:where(.svedit-inline-node) :global(*) {
		pointer-events: none;
	}

	/* Editable text base layout; :where() allows easy override without specificity conflicts. */
	:where(.text) {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		box-sizing: content-box;
	}

	/* We switch from ::before to ::after when the element is focused. So the the caret is always before the placeholder. */
	[placeholder].empty:not(.focused)::before,
	[placeholder].empty.focused::after {
		content: attr(placeholder);
		pointer-events: none;
		color: color-mix(in oklch, currentcolor 50%, transparent);
	}

	/* A virtual caret: to fix the caret vertical alignment issue in Chrome and Firefox for empty focused contenteditable with placeholders */
	/* Browser BUG: iOS Safari only considers the caret color set on the top contenteditable element, not on nested elements (e.g. the second selector doesn't work in iOS Safari) */
	:global(.svedit.editable .svedit-canvas:has([placeholder].empty.focused)),
	:global(.svedit.editable) [placeholder].empty.focused {
		caret-color: transparent !important;
	}
	:global(.svedit.editable) [placeholder].empty.focused::before {
		content: '';
		/* we limit width & height to avoid layout shifts in case the text has a lower natural height */
		width: 0px;
		height: 1cap;
		display: inline-block;
		/* we use box-shadow to draw the caret shape, matching the native caret */
		box-shadow:
			0 -0.4cap 0 0.65px var(--editing, AccentColor),
			0 0 0 0.65px var(--editing, AccentColor),
			0 0.4cap 0 0.65px var(--editing, AccentColor);
		animation: var(
			--node-caret-animation,
			node-caret-blink var(--node-caret-blink-duration, 1.1s) ease-in-out infinite
		);
	}

	/* Hide flickering: in Chrome, the caret jumps from end of placeholder string to start of text property when we focus */
	.text:not(.focused) {
		caret-color: transparent;
	}

	/* Disable text-transform when editable and focused so users see original text */
	:global(.svedit.editable) .text.focused {
		text-transform: none !important;
	}

	/* Dim the selection highlight when canvas loses native focus */
	:global(.svedit-canvas:not(:focus-within)) .selection-highlight {
		background: oklch(from var(--editing-muted) l 0 h / alpha);
	}

	/* Make a collapsed caret visible */
	:global(.svedit-canvas:not(:focus-within)) .selection-highlight:empty {
		background: none;
		outline: 0.5px solid oklch(from var(--editing) l 0 h / alpha);
	}
</style>
