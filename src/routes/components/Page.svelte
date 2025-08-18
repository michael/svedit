<script>
  import { Node, NodeArrayProperty } from 'svedit';

  let { path } = $props();
</script>

<Node {path}>
  <div class="page">
    <NodeArrayProperty class="body-node-array" path={[...path, 'body']} />
  </div>
</Node>

<style>
  :global {
    .body-node-array {
      /* padding: var(--s-8); */
      display: grid;
      grid-template-columns: 1fr;
      /* gap: 1rem; */
    }
  }
</style>
