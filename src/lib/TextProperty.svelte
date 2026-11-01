<script lang="ts">
	import { getContext } from 'svelte';
	import {
		char_slice,
		get_char_length,
		serialize_path,
		get_selection_range,
		calculate_fragment_ranges
	} from './utils.js';
	import type {
		TextPropertyProps,
		Text,
		Fragment,
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
	let text: Text = $derived(svedit.session.get(path));
	// Only re-evaluates while the selection is in the node owning this text
	let selection = $derived(svedit.session.selection_at(path));
	let is_focused = $derived(selection?.type === 'text');
	let is_empty = $derived(text.content.length === 0 && !(is_focused && svedit.is_composing));

	// While the canvas is blurred, a highlight span stands in for the native
	// selection (and serves as an anchor for popovers). It is never rendered
	// while focused: splitting text nodes during native selection causes
	// selection feedback loops. It is skipped when the selection touches marks.
	let highlight_range = $derived.by(() => {
		if (selection?.type !== 'text' || selection.anchor_offset === selection.focus_offset)
			return null;
		if (svedit.canvas_focused || svedit.session.selected_marks.length > 0) return null;
		return get_selection_range(selection);
	});

	let fragments = $derived(get_fragments(text, highlight_range));

	/** Split text into plain, mark and highlight fragments. Annotations never fragment text. */
	function get_fragments(text: Text, highlight_range: SelectionRange | null): Fragment[] {
		if (text.marks.length === 0 && !highlight_range) return text.content ? [text.content] : [];
		return calculate_fragment_ranges(
			get_char_length(text.content),
			text.marks,
			highlight_range
		).map((range): Fragment => {
			const content = char_slice(text.content, range.start_offset, range.end_offset);
			if (range.type === 'content') return content;
			if (range.type === 'selection_highlight') return { type: 'selection_highlight', content };
			const node = svedit.session.get(range.node_id!);
			if (!node) throw new Error(`Node not found for mark ${range.node_id}`);
			return { type: 'mark', node, content, mark_index: range.mark_index! };
		});
	}
</script>

<!-- ATTENTION: No whitespace between fragments, it would become text nodes. -->
<!-- The <br> keeps the element reachable by Arrow Up/Down navigation, and makes Shift+Enter work on non-empty text. -->
<!-- It is removed while the empty text is focused, since it breaks caret positioning (hiding it makes the caret disappear in Safari). -->
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
	{#each fragments as fragment, index (index)}{#if typeof fragment === 'string'}{fragment}{:else if fragment.type === 'selection_highlight'}<span
				class="selection-highlight"
				style="anchor-name: --selection-highlight;">{fragment.content}</span
			>{:else}{@const MarkComponent =
				svedit.session.config.node_components[fragment.node.type]}{#if MarkComponent}<MarkComponent
					path={[...path, 'marks', fragment.mark_index, 'node_id']}
					content={fragment.content}
				/>{:else}<span class="mark-{fragment.node.type}">{fragment.content}</span
				>{/if}{/if}{/each}{#if !is_focused || !is_empty}<br />{/if}
</svelte:element>

<style>
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
