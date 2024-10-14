<script>
  import Container from '$lib/Container.svelte';
  import ListItemBlock from '$lib/ListItemBlock.svelte';

  let { path } = $props();
</script>

<div
  data-path={path.join('.')}
  data-type="block"
  data-index={path.at(-1)}
  style="anchor-name: --{path.join('-')};"
>
  <Container class="list" path={[...path, 'items']}>
    <!-- NOTE: We only allow list items inside list  -->
    {#snippet block(block, path)}
      <ListItemBlock {block} {path} />
    {/snippet}
  </Container>
</div>

<style>
  div :global(.list) {
    background: #eee;
  }
</style>
