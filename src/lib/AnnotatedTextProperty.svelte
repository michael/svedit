<script>
	import { getContext } from 'svelte';
	import { char_slice, get_char_length, snake_to_pascal, get_selection_range } from './utils.js';

	/** @import { AnnotatedTextPropertyProps, Annotation, Fragment, SelectionRange } from './types.d.ts'; */

	const svedit = getContext('svedit');

	/** @type {AnnotatedTextPropertyProps} */
	let { path, class: css_class, placeholder = '', tag = 'div' } = $props();

	let is_focused = $derived.by(() => {
		return (
			svedit.session.selection?.type === 'text' &&
			path.join('.') === svedit.session.selection?.path.join('.')
		);
	});

	// Get selection highlight range if not inside an annotation
	let selection_highlight_range = $derived.by(() => {
		if (!is_focused) return null;
		if (svedit.session.active_annotation()) return null;
		const sel = svedit.session.selection;
		if (!sel || sel.type !== 'text') return null;
		return get_selection_range(sel);
	});

	/**
	 * Converts text with annotations into renderable fragments for display.
	 * @param {string} text - The plain text content
	 * @param {Array<Annotation>} annotations - Array of annotations
	 * @param {SelectionRange} [selection_highlight_range] - Optional selection highlight range
	 * @returns {Array<Fragment>} Array of fragments
	 */
	function get_fragments(text, annotations, selection_highlight_range) {
		/** @type {Array<Fragment>} */
		let fragments = [];
		let last_index = 0;

		// Merge annotations with selection highlight and sort by start offset
		const ranges = [
			...annotations,
			...(selection_highlight_range ? [selection_highlight_range] : [])
		].sort((a, b) => a.start_offset - b.start_offset);

		for (const range of ranges) {
			// Add text before this range
			if (range.start_offset > last_index) {
				fragments.push(char_slice(text, last_index, range.start_offset));
			}

			const content = char_slice(text, range.start_offset, range.end_offset);

			if ('node_id' in range) {
				const node = svedit.session.get(range.node_id);
				if (!node) throw new Error(`Node not found for annotation ${range.node_id}`);

				fragments.push({
					type: 'annotation',
					node,
					content,
					annotation_index: annotations.indexOf(/** @type {Annotation} */ (range))
				});
			} else {
				fragments.push({
					type: 'selection_highlight',
					content
				});
			}

			last_index = range.end_offset;
		}

		// Add any remaining text
		if (last_index < get_char_length(text)) {
			fragments.push(char_slice(text, last_index));
		}

		return fragments;
	}

	let fragments = $derived(
		get_fragments(
			svedit.session.get(path).text,
			svedit.session.get(path).annotations,
			selection_highlight_range
		)
	);
	let plain_text = $derived(svedit.session.get(path).text);
	let is_empty = $derived(
		get_char_length(plain_text) === 0 && !(svedit.is_composing && is_focused)
	);
</script>

<!-- ATTENTION: The comments are needed to prevent unwanted text nodes with whitespace. -->
<!-- We need to use <br> so the element is reachable by Arrow Up/Down navigation. -->
<!-- But as soon as the element is focused, we get rid of the <br> as it causes issues with caret positioning. -->
<!-- Before, we were just hiding it on focus, but that caused the cursor to disappear on Safari Desktop (tested with v26). -->
<!-- Edge Case: Shift Enter stops working if <br> is not present on a non-empty text property. -->
<svelte:element
	this={tag}
	data-type="text"
	data-path={path.join('.')}
	style="anchor-name: --{path.join('-')};"
	class="text svedit-selectable {css_class}"
	class:empty={is_empty}
	class:focused={is_focused}
	{placeholder}
>
	{#each fragments as fragment, index (index)}
		{#if typeof fragment === 'string'}{fragment}{:else if fragment.type === 'selection_highlight'}<span
				class="selection-highlight"
				style="anchor-name: --selection-highlight;">{fragment.content}</span
			>{:else if fragment.type === 'annotation'}
			{@const AnnotationComponent =
				svedit.session.config.node_components[snake_to_pascal(fragment.node.type)]}
			<AnnotationComponent
				path={[...path, 'annotations', fragment.annotation_index, 'node_id']}
				content={fragment.content}
			/>
		{/if}
	{/each}<!--
  -->{#if !is_focused || !is_empty}<br />{/if}
</svelte:element>

<style>
	.text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		box-sizing: content-box;

		&.heading1 {
			text-wrap: var(--text-wrap);
		}
	}
	/* We switch from ::before to ::after when the element is focused. So the the caret is always before the placeholder. */
	[placeholder].empty:not(.focused)::before,
	[placeholder].empty.focused::after {
		content: attr(placeholder);
		pointer-events: none;
		color: color-mix(in oklch, currentcolor 50%, transparent);
	}

	/* Hide flickering: in Chrome, the caret jumps from end of placeholder string to start of text property when we focus */
	.text:not(.focused) {
		caret-color: transparent;
	}

	/*.text.focused {
    background: none;
    outline: 1px solid var(--editing-stroke-color);
  }*/

	/* Dim the selection highlight when canvas loses native focus */
	:global(.svedit-canvas:not(:focus)) .selection-highlight {
		background: var(--editing-fill-color);
	}

	/* Make a collapsed cursor visible */
	:global(.svedit-canvas:not(:focus)) .selection-highlight:empty {
		background: none;
		outline: 0.5px solid var(--editing-stroke-color);
	}
</style>
