<script>
  import Node from '$lib/Node.svelte';
  import NodeArrayProperty from '$lib/NodeArrayProperty.svelte';
  import ImageGridItem from './ImageGridItem.svelte';
  import { getContext } from 'svelte';

  const svedit = getContext('svedit');
  let { path } = $props();
  let node = $derived(svedit.doc.get(path));
  let list_style = $derived(node.list_style);
</script>

<Node {path}>
  <div class="image-grid max-w-screen-lg mx-auto">
    <NodeArrayProperty class="image-grid-items" path={[...path, 'image_grid_items']}>
      <!-- NOTE: We only allow image_grid_items inside image_grid -->
      {#snippet node(node, path)}
        <ImageGridItem {node} {path} {list_style} />
      {/snippet}
    </NodeArrayProperty>
  </div>
</Node>

<style>
  .image-grid :global {
    .image-grid-items {
      padding: calc(var(--s-10) * 3) 0;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1rem;
    }
  }
</style>
