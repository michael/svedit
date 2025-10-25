<script>
  import { getContext } from 'svelte';

  /** @import { NodeProps } from './types.d.ts'; */

  const svedit = getContext('svedit');
  let NodeCursorTrap = $derived(svedit.doc.config.system_components.NodeCursorTrap);

  /** @type {NodeProps} */
  let {
    path,
    children,
    tag = 'div',
    class: css_class,
  } = $props();

  // NOTE: When the next to last path segment is a node_array property, the node is wrapped in a node_array
  let is_inside_node_array = $derived(path.length > 1 && svedit.doc.inspect(path.slice(0, -1))?.type === 'node_array');
  let node = $derived(svedit.doc.get(path));
  let is_first_node_array_child = $derived(is_inside_node_array && parseInt(String(path.at(-1)), 10) === 0);
</script>

<svelte:element this={tag}
  class={css_class}
  data-node-id={node.id}
  data-path={path.join('.')}
  data-type="node"
  style="anchor-name: --{path.join('-')};"
>
  {#if svedit.editable && is_first_node_array_child}
    <NodeCursorTrap {path} type="position-zero-cursor-trap" />
  {/if}
  {@render children()}
  {#if svedit.editable && is_inside_node_array}
    <NodeCursorTrap {path} type="after-node-cursor-trap" />
  {/if}
</svelte:element>

<style>
  div {
    position: relative;
  }
</style>
