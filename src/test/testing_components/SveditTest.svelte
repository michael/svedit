<script>
  import Svedit from '../../lib/Svedit.svelte';
	import Layout from '../../routes/components/Layout.svelte';

  let { doc } = $props();
</script>

<Layout>
  <Svedit {doc} editable={true} path={[doc.document_id]} />
</Layout>
