<script>
  import Node from '../../lib/Node.svelte';
  import NodeArrayProperty from '../../lib/NodeArrayProperty.svelte';
  import ListItem from './ListItem.svelte';
  let { path } = $props();
</script>

<Node {path}>
  <div class="list max-w-screen-md mx-auto">
    <NodeArrayProperty class="list-node-array" path={[...path, 'list_items']} />
  </div>
</Node>

<style>
  .list :global(.list-node-array) {
    --layout-orientation: vertical;
    --padding-block: var(--s-10);
    --row-gap: var(--s-4);
    counter-reset: listcounter;
    display: flex;
    flex-direction: column;
    row-gap: var(--row-gap);
    padding-block: var(--padding-block);
  }
</style>
