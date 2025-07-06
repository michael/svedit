<script>
  import { getContext } from 'svelte';
  import CursorTrap from './CursorTrap.svelte';

  const svedit = getContext('svedit');

  let {
    path,
    node,
    class: css_class,
  } = $props();

  let nodes = $derived(svedit.doc.get(path).map(node_id => svedit.doc.get(node_id)));
</script>

<div class={css_class} data-type="node_array" data-path={path.join('.')}>
  {#if nodes.length === 0}
    <!--
    Experimental: We'll let .empty-node-array act like a node, so the existing
    code paths for selection mapping will work as expected.

    TODO: Need to figure out a way to make .empty-container customizable.
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
  {#each nodes as _node, index }
    {@render node(_node, [...path, index], index)}
  {/each}
</div>
