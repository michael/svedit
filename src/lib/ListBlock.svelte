<script>
  import Block from './Block.svelte';
  import Container from './Container.svelte';
  import ListItemBlock from './ListItemBlock.svelte';
  import { getContext } from 'svelte';
  
  const svedit = getContext('svedit');
  let { path } = $props();
  let block = $derived(svedit.doc.get(path));
  let list_style = $derived(block.list_style);
</script>

<Block class="list p-10 max-w-screen-md mx-auto" {path}>
  <Container path={[...path, 'list_items']}>
    <!-- NOTE: We only allow list items inside list  -->
    {#snippet block(block, path)}
      <ListItemBlock {block} {path} {list_style} />
    {/snippet}
  </Container>
</Block>

<style>
  :global(.list) {
    background: var(--secondary-fill-color);
    padding: var(--s-4);
  }
</style>
