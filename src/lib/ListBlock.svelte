<script>
  import Container from './Container.svelte';
  import ListItemBlock from './ListItemBlock.svelte';
  import { getContext } from 'svelte';
  
  const svedit = getContext('svedit');
  let { path } = $props();
  let block = $derived(svedit.doc.get(path));
  let list_style = $derived(block.list_style);
</script>

<div
  data-path={path.join('.')}
  data-type="block"
  data-index={path.at(-1)}
  style="anchor-name: --{path.join('-')};"
  class='p-10 max-w-screen-md mx-auto'
>
  <Container class="list" path={[...path, 'list_items']}>
    <!-- NOTE: We only allow list items inside list  -->
    {#snippet block(block, path)}
      <ListItemBlock {block} {path} {list_style} />
    {/snippet}
  </Container>
</div>

<style>
  div :global(.list) {
    background: var(--secondary-fill-color);
    padding: var(--s-4);
  }
</style>
