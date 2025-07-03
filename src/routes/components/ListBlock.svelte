<script>
  import Block from '$lib/Block.svelte';
  import Container from '$lib/Container.svelte';
  import ListItemBlock from './ListItemBlock.svelte';
  import { getContext } from 'svelte';

  const svedit = getContext('svedit');
  let { path } = $props();
  let block = $derived(svedit.doc.get(path));
  let list_style = $derived(block.list_style);
</script>

<Block {path}>
  <div class="list max-w-screen-md mx-auto">
    <Container class="list-container" path={[...path, 'list_items']}>
      <!-- NOTE: We only allow list items inside list  -->
      {#snippet block(block, path)}
        <ListItemBlock {block} {path} {list_style} />
      {/snippet}
    </Container>
  </div>
</Block>

<style>
  .list {
    /* background: var(--secondary-fill-color); */
    padding: var(--s-6);
    counter-reset: listcounter;
  }
</style>
