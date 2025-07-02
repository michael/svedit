<script>
  import { getContext } from 'svelte';
  import CursorTrap from './CursorTrap.svelte';

  const svedit = getContext('svedit');

  let {
    path,
    block,
    class: css_class,
  } = $props();

  let blocks = $derived(svedit.doc.get(path).map(block_id => svedit.doc.get(block_id)));
</script>

<div class={css_class} data-type="container" data-path={path.join('.')}>
  {#each blocks as _block, index }
    {@render block(_block, [...path, index], index)}
  {/each}
</div>
