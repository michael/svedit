<script>
  import { getContext } from 'svelte';
  const svedit = getContext('svedit');

  let {
    path,
    block,
    class: css_class,
  } = $props();

  let blocks = $derived(svedit.document.get(path).map(block_id => svedit.document.get(block_id)));

  $inspect(blocks);
</script>

<div class={css_class} data-type="container" data-path={path.join('.')}>
  {#each blocks as _block, index}
    {@render block(_block, index)}
  {/each}
</div>