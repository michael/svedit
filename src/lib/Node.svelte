<script>
  import CursorTrap from './CursorTrap.svelte';
  import { getContext } from 'svelte';

  /** @import { NodeProps } from './types.d.ts'; */

  const svedit = getContext('svedit');

  /** @type {NodeProps} */
  let {
    path,
    children
  } = $props();

  // NOTE: When the next to last path segment is a node_array property, the node is wrapped in a node_array
  let is_inside_node_array = $derived(path.length > 1 && svedit.doc.inspect(path.slice(0, -1))?.type === 'node_array');
  let node = $derived(svedit.doc.get(path));
  let is_first_node_array_child = $derived(is_inside_node_array && parseInt(String(path.at(-1)), 10) === 0);
</script>

<div
  class="node"
  data-node-id={node.id}
  data-path={path.join('.')}
  data-type="node"
  style="anchor-name: --{path.join('-')};"
>
  {#if is_first_node_array_child}
    <CursorTrap node_array_path={path.slice(0, -1)} type="position-zero-cursor-trap" />
  {/if}
  {@render children()}
  {#if is_inside_node_array}
    <CursorTrap node_array_path={path.slice(0, -1)} type="after-node-cursor-trap" />
  {/if}
</div>

<style>
  div {
    position: relative;
  }
</style>
