<script>
  import Svedit from '../../lib/Svedit.svelte';
  import NodeArrayProperty from '../../lib/NodeArrayProperty.svelte';
  import Story from '../../lib/Story.svelte';
  import List from '../../lib/List.svelte';
  import UnknownNode from '../../lib/UnknownNode.svelte';
	import Layout from '../../lib/Layout.svelte';

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
  </Svedit>
</Layout>
