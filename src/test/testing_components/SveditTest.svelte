<script>
  import Svedit from '../../lib/Svedit.svelte';
  import NodeArrayProperty from '../../lib/NodeArrayProperty.svelte';
  import StoryBlock from '../../lib/StoryBlock.svelte';
  import ListBlock from '../../lib/ListBlock.svelte';
  import UnknownBlock from '../../lib/UnknownBlock.svelte';
	import Layout from '../../lib/Layout.svelte';

  let { doc } = $props();
</script>

<Layout>
  <Svedit {doc} editable={true} class='flex-column'>
    <NodeArrayProperty class="body flex-column gap-y-10" path={[doc.document_id, 'body']}>
      {#snippet block(block, path)}
        {#if block.type === 'story'}
          <StoryBlock {path} />
        {:else if block.type === 'list'}
          <ListBlock {path} />
        {:else}
          <UnknownBlock {path} />
        {/if}
      {/snippet}
    </NodeArrayProperty>
  </Svedit>
</Layout>
