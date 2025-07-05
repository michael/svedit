<script>
	import { getContext } from 'svelte';
	const svedit = getContext('svedit');

	let { path, class: css_class, editable = true } = $props();

	let is_focused = $derived.by(() => {
		return svedit.doc.selection?.type === 'text' && path.join('.') === svedit.doc.selection?.path.join('.');
	});

	function render_annotated_string(text, annotations) {
		let fragments = [];
		let last_index = 0;

		// Sort annotations by start_offset
		const sorted_annotations = $state.snapshot(annotations).sort((a, b) => a[0] - b[0]);

		for (let [index, annotation] of sorted_annotations.entries()) {
			// Add text before the annotation
			if (annotation[0] > last_index) {
				fragments.push(text.slice(last_index, annotation[0]));
			}

			// Add the annotated text
			const annotated_content = text.slice(annotation[0], annotation[1]);
			fragments.push({
				type: annotation[2],
				content: annotated_content,
				annotation_index: index,
				...annotation[3]
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

	function handle_link_click(e) {
		if (editable) {
			e.preventDefault();
		}
	}
</script>

<!-- ATTENTION: The comment blocks are needed to prevent unwanted text nodes with whitespace. -->
<div
 	data-type="text"
 	data-path={path.join('.')}
 	style="anchor-name: --{path.join('-')};"
 	class="text svedit-selectable {css_class}"
 	class:empty={plain_text.length === 0}
  class:focused={is_focused}
>
  {#each fragments as fragment, index}
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
				href={fragment.href}
				target={fragment.target || '_self'}>{fragment.content}</a><!--
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

		/* &.heading1 {
      text-wrap: var(--text-wrap);
    } */
  }

  .text.empty {
    background: #efefef;
    outline: none;
  }

  .text.empty:not(.focused):hover {
    background: lightgray;
  }

  .text.focused {
    background: none;
    outline: 1px dashed var(--editing-stroke-color);
  }

</style>
