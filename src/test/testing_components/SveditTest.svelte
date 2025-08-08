<script>
  import Svedit from '../../lib/Svedit.svelte';
	import Layout from '../../routes/components/Layout.svelte';
	import Overlays from '../../routes/components/Overlays.svelte';

  let { doc } = $props();
</script>

<Layout>
  <Svedit {doc} editable={true} path={[doc.document_id]}>
    {#snippet overlays()}
      <Overlays />
    {/snippet}
  </Svedit>
</Layout>
