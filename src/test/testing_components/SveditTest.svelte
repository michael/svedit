<script>
  import Svedit from '../../lib/Svedit.svelte';
  import NodeArrayProperty from '../../lib/NodeArrayProperty.svelte';
  import Story from '../../routes/components/Story.svelte';
  import List from '../../routes/components/List.svelte';
  import UnknownNode from '../../routes/components/UnknownNode.svelte';
	import Layout from '../../routes/components/Layout.svelte';
	import Overlays from '../../routes/components/Overlays.svelte';

  let { doc } = $props();
</script>

<Layout>
  <Svedit {doc} editable={true} class='flex-column'>
    <NodeArrayProperty class="body flex-column gap-y-10" path={[doc.document_id, 'body']}>
      {#snippet node(node, path)}
        {#if node.type === 'story'}
          <Story {path} />
        {:else if node.type === 'list'}
          <List {path} />
        {:else}
          <UnknownNode {path} />
        {/if}
      {/snippet}
    </NodeArrayProperty>
    {#snippet overlays()}
      <Overlays />
    {/snippet}
  </Svedit>
</Layout>
