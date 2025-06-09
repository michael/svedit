<script>
  import Svedit from '../../lib/Svedit.svelte';
  import Container from '../../lib/Container.svelte';
  import StoryBlock from '../../lib/StoryBlock.svelte';
  import ListBlock from '../../lib/ListBlock.svelte';
  import UnknownBlock from '../../lib/UnknownBlock.svelte';
	import Layout from '../../lib/Layout.svelte';

  let { doc } = $props();
</script>

<Layout>
  <Svedit {doc} editable={true} class='flex-column'>
    <Container class="body flex-column gap-y-10" path={[doc.doc_id, 'body']}>
      {#snippet block(block, path)}
        {#if block.type === 'story'}
          <StoryBlock {path} />
        {:else if block.type === 'list'}
          <ListBlock {path} />
        {:else}
          <UnknownBlock {path} />
        {/if}
      {/snippet}
    </Container>
  </Svedit>
</Layout>
