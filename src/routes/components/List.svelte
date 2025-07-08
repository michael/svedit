<script>
  import Node from '$lib/Node.svelte';
  import NodeArrayProperty from '$lib/NodeArrayProperty.svelte';
  import ListItem from './ListItem.svelte';
  import { getContext } from 'svelte';

  const svedit = getContext('svedit');
  let { path } = $props();
  let node = $derived(svedit.doc.get(path));
  let list_style = $derived(node.list_style);
</script>

<Node {path}>
  <div class="list max-w-screen-md mx-auto">
    <NodeArrayProperty class="list-node-array" path={[...path, 'list_items']}>
      <!-- NOTE: We only allow list items inside list  -->
      {#snippet node(node, path)}
        <ListItem {node} {path} {list_style} />
      {/snippet}
    </NodeArrayProperty>
  </div>
</Node>

<style>
  .list {
    padding: var(--s-10) 0;
    counter-reset: listcounter;
  }
</style>
