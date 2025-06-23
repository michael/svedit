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

<Block {path}>
  <div class="list max-w-screen-md mx-auto">
    <Container class="list-container sv-horizontal" path={[...path, 'list_items']}>
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
    padding: var(--s-2);
    counter-reset: listcounter;
  }

  /* Override when we use horizontal flow in containers */
  .list :global {
    .list-container > .block > .cursor-trap {
      position: absolute;
      bottom: -6px;
      left: 0;
      right: 0;
      height: 12px;
      z-index: 1000;
    }
  }

</style>
