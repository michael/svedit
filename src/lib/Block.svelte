<script>
  import CursorTrap from './CursorTrap.svelte';
  import { getContext } from 'svelte';

  const svedit = getContext('svedit');
  let {
    path,
    children
  } = $props();

  // NOTE: When the next to last path segment is a multiref property, the node is wrapped in a container
  let is_inside_container = $derived(path.length > 1 && svedit.doc.inspect(path.slice(0, -1))?.type === 'multiref');
  // NOTE: If we are inside in a cont
  let is_first_container_child = $derived(is_inside_container && parseInt(path.at(-1), 10) === 0);
</script>

<div
  class="block"
  data-path={path.join('.')}
  data-type="block"
  style="anchor-name: --{path.join('-')};"
>
  {#if is_first_container_child}
    <CursorTrap container_path={path.slice(0, -1)} type="position-zero-cursor-trap" />
  {/if}
  {@render children()}
  {#if is_inside_container}
    <CursorTrap container_path={path.slice(0, -1)} type="after-node-cursor-trap" />
  {/if}
</div>

<style>
  div {
    position: relative;
  }
</style>
