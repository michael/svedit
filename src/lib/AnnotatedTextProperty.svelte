<script>
	import { getContext } from 'svelte';
	import { char_slice, get_char_length, snake_to_pascal } from './util.js';

  /** @import { AnnotatedTextPropertyProps, Annotation, AnnotationFragment } from './types.d.ts'; */

	const svedit = getContext('svedit');

 /** @type {AnnotatedTextPropertyProps} */
	let {
		path,
		class: css_class,
		placeholder = '',
		tag = 'div'
	} = $props();

	let is_focused = $derived.by(() => {
		return svedit.doc.selection?.type === 'text' && path.join('.') === svedit.doc.selection?.path.join('.');
	});

	/**
	 * Converts text with annotations into renderable fragments for display.
	 * @param {string} text - The plain text content
	 * @param {Array<Annotation>} annotations - Array of annotations where each is {start_offset, end_offset, node_id}
	 * @returns {Array<string|AnnotationFragment>} Array of fragments - strings for plain text, AnnotationFragment objects for annotated content
	 */
	function get_fragments(text, annotations) {
		let fragments = [];
		let last_index = 0;

		// Sort annotations by start_offset
		const sorted_annotations = [...annotations].sort((a, b) => a.start_offset - b.start_offset);

		for (let [, annotation] of sorted_annotations.entries()) {
			// Add text before the annotation using character-aware slicing
			if (annotation.start_offset > last_index) {
				fragments.push(char_slice(text, last_index, annotation.start_offset));
			}

			// Add the annotated string using character-aware slicing
			const annotated_content = char_slice(text, annotation.start_offset, annotation.end_offset);
			const node = svedit.doc.get(annotation.node_id);
			if (!node) throw new Error(`Node not found for annotation ${annotation.node_id}`);

			fragments.push({
			  node,
				content: annotated_content,
				// NOTE: We need to provide the original index here, because the source data
				// is the address space.
				annotation_index: annotations.indexOf(annotation),
			});

			last_index = annotation.end_offset;
		}

		// Add any remaining text after the last annotation using character-aware slicing
		if (last_index < get_char_length(text)) {
			fragments.push(char_slice(text, last_index));
		}

		return fragments;
	}

	let fragments = $derived(get_fragments(svedit.doc.get(path).text, svedit.doc.get(path).annotations));
	let plain_text = $derived(svedit.doc.get(path).text);
	let is_empty = $derived(get_char_length(plain_text) === 0 && !(svedit.is_composing && is_focused));

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
  placeholder={placeholder}
>
  {#each fragments as fragment, index (index)}
		{#if typeof fragment === 'string'}{fragment}{:else}
      {@const AnnotationComponent = svedit.doc.config.node_components[snake_to_pascal(fragment.node.type)]}
      <AnnotationComponent path={[...path, 'annotations', fragment.annotation_index, 'node_id']} content={fragment.content} />
    {/if}
 	{/each}<!--
  -->{#if !is_focused || !is_empty}<br>{/if}
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
</style>
