<script>
	import { getContext } from 'svelte';
	import { char_slice, get_char_length, snake_to_pascal, get_selection_range } from './utils.js';

	/** @import { AnnotatedTextPropertyProps, Annotation, Fragment } from './types.d.ts'; */

	const svedit = getContext('svedit');

	/** @type {AnnotatedTextPropertyProps} */
	let { path, class: css_class, placeholder = '', tag = 'div' } = $props();

	let is_focused = $derived.by(() => {
		return (
			svedit.session.selection?.type === 'text' &&
			path.join('.') === svedit.session.selection?.path.join('.')
		);
	});

	// Get selection range if this property is focused and selection is not collapsed
	let selection_range = $derived.by(() => {
		if (!is_focused) return null;
		const sel = svedit.session.selection;
		if (!sel || sel.type !== 'text') return null;
		const range = get_selection_range(sel);
		if (!range || range.start === range.end) return null;
		return range;
	});

	/**
	 * Check if selection overlaps with any annotation
	 * @param {number} sel_start
	 * @param {number} sel_end
	 * @param {Array<Annotation>} annotations
	 * @returns {boolean}
	 */
	function selection_overlaps_annotation(sel_start, sel_end, annotations) {
		return annotations.some(
			({ start_offset, end_offset }) => sel_start < end_offset && sel_end > start_offset
		);
	}

	// Get selection highlight info if selection doesn't overlap annotations
	let selection_highlight = $derived.by(() => {
		if (!selection_range) return null;
		const annotations = svedit.session.get(path).annotations;
		if (selection_overlaps_annotation(selection_range.start, selection_range.end, annotations)) {
			return null;
		}
		return {
			start: selection_range.start,
			end: selection_range.end
		};
	});

	/**
	 * Converts text with annotations into renderable fragments for display.
	 * Also inserts a selection highlight fragment if applicable.
	 * @param {string} text - The plain text content
	 * @param {Array<Annotation>} annotations - Array of annotations where each is {start_offset, end_offset, node_id}
	 * @param {{ start: number, end: number } | null} sel_highlight - Selection highlight range if any
	 * @returns {Array<Fragment>} Array of fragments
	 */
	function get_fragments(text, annotations, sel_highlight) {
		/** @type {Array<Fragment>} */
		let fragments = [];
		let last_index = 0;

		// Sort annotations by start_offset
		const sorted_annotations = [...annotations].sort((a, b) => a.start_offset - b.start_offset);

		// Create a merged list of breakpoints (annotations + selection highlight)
		/** @type {Array<{ type: 'annotation', start: number, end: number, annotation: Annotation } | { type: 'selection_highlight', start: number, end: number }>} */
		let breakpoints = sorted_annotations.map((a) => ({
			type: 'annotation',
			start: a.start_offset,
			end: a.end_offset,
			annotation: a
		}));

		if (sel_highlight) {
			breakpoints.push({
				type: 'selection_highlight',
				start: sel_highlight.start,
				end: sel_highlight.end
			});
			// Re-sort by start offset
			breakpoints.sort((a, b) => a.start - b.start);
		}

		for (let bp of breakpoints) {
			// Add text before this breakpoint
			if (bp.start > last_index) {
				fragments.push(char_slice(text, last_index, bp.start));
			}

			const content = char_slice(text, bp.start, bp.end);

			if (bp.type === 'annotation') {
				const node = svedit.session.get(bp.annotation.node_id);
				if (!node) throw new Error(`Node not found for annotation ${bp.annotation.node_id}`);

				fragments.push({
					type: 'annotation',
					node,
					content,
					annotation_index: annotations.indexOf(bp.annotation)
				});
			} else if (bp.type === 'selection_highlight') {
				fragments.push({
					type: 'selection_highlight',
					content
				});
			}

			last_index = bp.end;
		}

		// Add any remaining text after the last breakpoint
		if (last_index < get_char_length(text)) {
			fragments.push(char_slice(text, last_index));
		}

		return fragments;
	}

	let fragments = $derived(
		get_fragments(
			svedit.session.get(path).text,
			svedit.session.get(path).annotations,
			selection_highlight
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

	.selection-highlight {
		background: var(--editing-fill-color);
	}
</style>
