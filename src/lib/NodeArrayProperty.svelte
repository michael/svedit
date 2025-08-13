<script>
  import { getContext } from 'svelte';
  import CursorTrap from './CursorTrap.svelte';
  import UnknownNode from './UnknownNode.svelte';

  /** @import { NodeArrayPropertyProps } from './types.d.ts'; */

  const svedit = getContext('svedit');

  /** @type {NodeArrayPropertyProps} */
  let {
    path,
    class: css_class,
  } = $props();

  let nodes = $derived(svedit.doc.get(path).map(/** @param {string} node_id */ (node_id) => svedit.doc.get(node_id)));
</script>

<div class={css_class} data-type="node_array" data-path={path.join('.')}>
  {#if nodes.length === 0}
    <!--
    Experimental: We'll let .empty-node-array act like a node, so the existing
    code paths for selection mapping will work as expected.

    TODO: Need to figure out a way to make .empty-node-array customizable.
    -->
    <div
      class="node empty-node-array"
      data-path={[...path, 0].join('.')}
      data-type="node"
      style="anchor-name: --{[...path, 0].join('-')}; position: relative; min-height: 40px; min-width: 40px;"
    >
      <CursorTrap node_array_path={path} type="position-zero-cursor-trap" />
    </div>
  {/if}
  {#each nodes as node, index (index) }
    {@const Component = svedit.doc.config.node_components[node.type]}
    {#if Component}
      <Component path={[...path, index]} />
    {:else}
      <UnknownNode path={[...path, index]} />
    {/if}
  {/each}
</div>
