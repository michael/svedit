<script>
  import { Node, NodeArrayProperty } from 'svedit';
  let { path } = $props();
</script>

<Node {path}>
  <div class="image-grid max-w-screen-lg mx-auto">
    <NodeArrayProperty class="image-grid-items" path={[...path, 'image_grid_items']} />
  </div>
</Node>

<style>
  .image-grid {
    width: 100%;
    padding: var(--s-6);
  }
  .image-grid :global {
    --layout-orientation: horizontal;

    .image-grid-items {
      padding: calc(var(--s-10) * 3) 0;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }

    /* Tablet screens */
    @media (max-width: 768px) {
      .image-grid-items {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    /* Mobile screens */
    @media (max-width: 480px) {
      --layout-orientation: vertical;
      .image-grid-items {
        grid-template-columns: repeat(1, 1fr);
      }
    }
  }
</style>
