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
  .list {
    padding: var(--s-10) 0;
    counter-reset: listcounter;
  }
</style>
