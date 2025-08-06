<script>
  import Svedit from '../../lib/Svedit.svelte';
  import NodeArrayProperty from '../../lib/NodeArrayProperty.svelte';
	import Layout from '../../routes/components/Layout.svelte';
	import Overlays from '../../routes/components/Overlays.svelte';

  let { doc } = $props();
</script>

<Layout>
  <Svedit {doc} editable={true} class='flex-column'>
    <NodeArrayProperty class="body flex-column gap-y-10" path={[doc.document_id, 'body']} />
    {#snippet overlays()}
      <Overlays />
    {/snippet}
  </Svedit>
</Layout>
