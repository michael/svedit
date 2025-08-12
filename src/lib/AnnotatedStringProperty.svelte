<script>
	import { getContext } from 'svelte';
	/** @typedef {import('./Document.svelte.js').DocumentPath} DocumentPath */
	const svedit = getContext('svedit');

	let {
		/** @type {DocumentPath} */
		path,
		class: css_class,
		editable = true,
		placeholder,
	} = $props();

	let is_focused = $derived.by(() => {
		return svedit.doc.selection?.type === 'text' && path.join('.') === svedit.doc.selection?.path.join('.');
	});

	/**
	 * @typedef {Object} AnnotationFragment
	 * @property {string} type - The annotation type (e.g., 'link', 'emphasis', 'strong')
	 * @property {string} content - The text content of the annotation
	 * @property {number} annotation_index - Index of the annotation in the original array
	 * @property {any} [data] - Optional properties from the annotation's options object
	 */

	/**
	 * Converts text with annotations into renderable fragments for display.
	 * @param {string} text - The plain text content
	 * @param {Array<[number, number, string, ...any]>} annotations - Array of annotations where each is [start_offset, end_offset, type, options?] (minimum 3 elements)
	 * @returns {Array<string|AnnotationFragment>} Array of fragments - strings for plain text, AnnotationFragment objects for annotated content
	 */
	function render_annotated_string(text, annotations) {
	  console.log('render_annotated_string', text, annotations);
		let fragments = [];
		let last_index = 0;

		// Sort annotations by start_offset
		const sorted_annotations = $state.snapshot(annotations).sort((a, b) => a[0] - b[0]);

		for (let [index, annotation] of sorted_annotations.entries()) {
			// Add text before the annotation
			if (annotation[0] > last_index) {
				fragments.push(text.slice(last_index, annotation[0]));
			}

			// Add the annotated string
			const annotated_content = text.slice(annotation[0], annotation[1]);
			fragments.push({
				type: annotation[2],
				content: annotated_content,
				annotation_index: index,
				data: annotation[3]
			});

			last_index = annotation[1];
		}

		// Add any remaining text after the last annotation
		if (last_index < text.length) {
			fragments.push(text.slice(last_index));
		}

		return fragments;
	}

	let fragments = $derived(render_annotated_string(svedit.doc.get(path)[0], svedit.doc.get(path)[1]));
	let plain_text = $derived(svedit.doc.get(path)[0]);

	/**
	 * @param {MouseEvent} e - The click event
	 */
	function handle_link_click(e) {
		if (editable) {
			e.preventDefault();
		}
	}
</script>

<!-- ATTENTION: The comments are needed to prevent unwanted text nodes with whitespace. -->
<div
 	data-type="text"
 	data-path={path.join('.')}
 	style="anchor-name: --{path.join('-')};"
 	class="text svedit-selectable {css_class}"
 	class:empty={plain_text.length === 0}
  class:focused={is_focused}
  placeholder={placeholder}
>
  {#each fragments as fragment, index (index)}
		{#if typeof fragment === 'string'}<!--
      -->{fragment}<!--
    -->{:else if fragment.type === 'emphasis'}<!--
      --><em>{fragment.content}</em><!--
    -->{:else if fragment.type === 'strong'}<!--
      --><strong>{fragment.content}</strong><!--
    -->{:else if fragment.type === 'link'}<!--
      --><a
				onclick={handle_link_click}
				style="anchor-name: --{path.join('-') + '-' + fragment.annotation_index};"
				href={fragment.data.href}
				target={fragment.data.target || '_self'}>{fragment.content}</a><!--
    -->{:else}<!--
      -->{fragment.content}<!--
    -->{/if}
	{/each}<!--
  --><br>
</div>

<style>
  .text {
    white-space: pre-wrap;
		overflow-wrap: anywhere;
		box-sizing: content-box;

		&.heading1 {
      text-wrap: var(--text-wrap);
    }
  }

  [placeholder].empty::before {
    content: attr(placeholder);
    pointer-events: none;
    color: color-mix(in oklch, currentcolor 50%, transparent);
  }

  /* We can safely hide the <br> element when the placeholder is empty and focused. */
  /* No longer the cursor will be rendered after the placeholder when focused. */
  [placeholder].empty.focused br {
    display:none;
  }

  .text.focused {
    background: none;
    outline: 1px dashed var(--editing-stroke-color);
  }
</style>
