<script>
  import { getContext } from 'svelte';
  const svedit = getContext('svedit');

  let { path, class: css_class } = $props();

  function render_annotated_text(text, annotations) {    
    let fragments = [];
    let last_index = 0;

    // Sort annotations by start_offset
    const sorted_annotations = $state.snapshot(annotations).sort((a, b) => a[0] - b[0]);

    for (let annotation of sorted_annotations) {
      // Add text before the annotation
      if (annotation[0] > last_index) {
        fragments.push(text.slice(last_index, annotation[0]));
      }

      // Add the annotated text
      const annotated_content = text.slice(annotation[0], annotation[1]);
      fragments.push({
        type: annotation[2],
        content: annotated_content,
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

  let fragments = $derived(render_annotated_text(svedit.entry_session.get(path)[0], svedit.entry_session.get(path)[1]));
  let plain_text = $derived(svedit.entry_session.get(path)[0]);
</script>


<!-- ATTENTION: The comment blocks are needed to prevent unwanted text nodes with whitespace. -->
<div 
  contenteditable="true" 
  data-type="text" 
  data-path={path.join('.')}
  class={css_class}
><!--
--><!-- Zero-width space for empty text --><!--
-->{#if plain_text.length === 0}&#8203;{/if}<!--
-->{#each fragments as fragment}<!--
  -->{#if typeof fragment === 'string'}<!--
    -->{fragment}<!--
  -->{:else if fragment.type === 'emphasis'}<!--
    --><em>{fragment.content}</em><!--
  -->{:else if fragment.type === 'strong'}<!--
    --><strong>{fragment.content}</strong><!--
  -->{:else if fragment.type === 'link'}<!--
    --><a href={fragment.href}>{fragment.content}</a><!--
  -->{:else}<!--
    -->{fragment.content}<!--
  -->{/if}<!--
-->{/each}<!--
--></div>

<style>
  div {
    white-space: pre-line;
    overflow-wrap: anywhere;
    box-sizing: content-box;
    &.heading1 {
      text-wrap: var(--text-wrap);
    }
  }
</style>