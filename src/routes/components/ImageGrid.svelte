<script>
  import Node from '../../lib/Node.svelte';
  import NodeArrayProperty from '../../lib/NodeArrayProperty.svelte';
  import { getContext } from 'svelte';

  const svedit = getContext('svedit');
  let { path } = $props();
  let node = $derived(svedit.doc.get(path));
</script>

<Node {path}>
  <NodeArrayProperty class="image-grid max-w-screen-lg mx-auto" path={[...path, 'image_grid_items']} />
</Node>

<style>
  :global(.image-grid) {
    --row-gap: 30px;
    --column-gap: 30px;
    --padding-inline: var(--s-6);
    --padding-block: var(--s-10);
    --layout-orientation: horizontal;
    padding: var(--padding-block) var(--padding-inline);
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--column-gap) var(--row-gap);
  }
  /* Tablet screens */
  @media (max-width: 768px) {
    :global(.image-grid) {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Mobile screens */
  @media (max-width: 480px) {
    :global(.image-grid) {
      --layout-orientation: vertical;
      grid-template-columns: repeat(1, 1fr);
    }
  }
</style>
