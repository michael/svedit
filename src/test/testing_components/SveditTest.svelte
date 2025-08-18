<script>
  import Svedit from '../../lib/Svedit.svelte';
	import Layout from '../../routes/components/Layout.svelte';
	import Overlays from '../../routes/components/Overlays.svelte';
	import NodeCursorTrap from '../../routes/components/NodeCursorTrap.svelte';

  let { doc } = $props();
</script>

<Layout>
  <Svedit {doc} editable={true} path={[doc.document_id]} {Overlays} {NodeCursorTrap} />
</Layout>
