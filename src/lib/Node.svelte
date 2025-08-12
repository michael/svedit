<script>
  import CursorTrap from './CursorTrap.svelte';
  import { getContext } from 'svelte';

  const svedit = getContext('svedit');
  let {
    path,
    children
  } = $props();

  // NOTE: When the next to last path segment is a node_array property, the node is wrapped in a node_array
  let is_inside_node_array = $derived(path.length > 1 && svedit.doc.inspect(path.slice(0, -1))?.type === 'node_array');
  let node = $derived(svedit.doc.get(path));
  let is_first_node_array_child = $derived(is_inside_node_array && parseInt(path.at(-1), 10) === 0);
</script>

<div
  class="node"
  data-node-id={node.id}
  data-path={path.join('.')}
  data-type="node"
  style="anchor-name: --{path.join('-')};"
>
  {#if is_first_node_array_child}
    <CursorTrap 
      type="position-zero-cursor-trap" 
      anchor={`--${path.join('-')}-before`}
    />
  {/if}
  {@render children()}
  {#if is_inside_node_array}
    <CursorTrap 
      type="after-node-cursor-trap" 
      anchor={`--${path.join('-')}-after`}
    />
  {/if}
</div>

<style>
  div {
    position: relative;
  }
</style>
