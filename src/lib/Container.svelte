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
  {#if blocks.length === 0}
    <!--
    Experimental: We'll let .empty-container act like a block, so the existing
    code paths for selection mapping will work as expected.

    TODO: Need to figure out a way to make .empty-container customizable.
    -->
    <div
      class="block empty-container"
      data-path={[...path, 0].join('.')}
      data-type="block"
      style="anchor-name: --{[...path, 0].join('-')}; position: relative; min-height: 40px; min-width: 40px;"
    >
      <CursorTrap container_path={path} type="position-zero-cursor-trap" />
    </div>
  {/if}
  {#each blocks as _block, index }
    {@render block(_block, [...path, index], index)}
  {/each}
</div>
