<script>
	import { getContext } from 'svelte';
	import { char_slice, get_char_length } from './util.js';

  /** @import { AnnotatedStringPropertyProps, Annotation, AnnotationFragment } from './types.d.ts'; */

	const svedit = getContext('svedit');

 /** @type {AnnotatedStringPropertyProps} */
	let {
		path,
		class: css_class,
		placeholder = '',
	} = $props();

	let is_focused = $derived.by(() => {
		return svedit.doc.selection?.type === 'text' && path.join('.') === svedit.doc.selection?.path.join('.');
	});

	/**
	 * Converts text with annotations into renderable fragments for display.
	 * @param {string} text - The plain text content
	 * @param {Array<Annotation>} annotations - Array of annotations where each is [start_offset, end_offset, type, options?] (minimum 3 elements)
	 * @returns {Array<string|AnnotationFragment>} Array of fragments - strings for plain text, AnnotationFragment objects for annotated content
	 */
	function render_annotated_string(text, annotations) {
		let fragments = [];
		let last_index = 0;

		// Sort annotations by start_offset
		const sorted_annotations = [...annotations].sort((a, b) => a[0] - b[0]);

		for (let [index, annotation] of sorted_annotations.entries()) {
			// Add text before the annotation using character-aware slicing
			if (annotation[0] > last_index) {
				fragments.push(char_slice(text, last_index, annotation[0]));
			}

			// Add the annotated string using character-aware slicing
			const annotated_content = char_slice(text, annotation[0], annotation[1]);
			fragments.push({
				type: annotation[2],
				content: annotated_content,
				annotation_index: index,
				data: annotation[3]
			});

			last_index = annotation[1];
		}

		// Add any remaining text after the last annotation using character-aware slicing
		if (last_index < get_char_length(text)) {
			fragments.push(char_slice(text, last_index));
		}

		return fragments;
	}

	let fragments = $derived(render_annotated_string(svedit.doc.get(path)[0], svedit.doc.get(path)[1]));
	let plain_text = $derived(svedit.doc.get(path)[0]);
	let text_length = $derived(get_char_length(plain_text));

	// Create a key that forces re-render in problematic edge cases
	let render_key = $derived.by(() => {
		const text_length = get_char_length(plain_text);
		// Force re-render when transitioning from empty to non-empty or vice versa
		return `${text_length === 0 ? 'empty' : 'nonempty'}`;
	});

	/**
	 * @param {MouseEvent} e - The click event
	 */
	function handle_link_click(e) {
		e.preventDefault();
	}
</script>

{#key render_key}
  <!-- ATTENTION: The comments are needed to prevent unwanted text nodes with whitespace. -->
  <div
   	data-type="text"
   	data-path={path.join('.')}
   	style="anchor-name: --{path.join('-')};"
   	class="text svedit-selectable {css_class}"
   	class:empty={text_length === 0}
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
{/key}

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
