<script>
  import CursorTrap from './CursorTrap.svelte';
  import { getContext } from 'svelte';

  const svedit = getContext('svedit');
  let {
    path,
    children
  } = $props();

  let is_inside_container = $derived(path.length > 1 && svedit.doc.inspect(path.slice(0, -1))?.type === 'multiref');
</script>

<div
  class="block"
  data-path={path.join('.')}
  data-type="block"
  style="anchor-name: --{path.join('-')};"
>
  {@render children()}
  {#if is_inside_container}
    <CursorTrap {path} type="after-node-cursor-trap" />
  {/if}
</div>

<style>
  div {
    position: relative;
  }
</style>
