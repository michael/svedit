<script>
	import Svedit from '../../lib/Svedit.svelte';
	import Layout from '../../routes/components/Layout.svelte';

	let { session } = $props();
</script>

<Layout>
	<Svedit {session} editable={true} path={[session.document_id]} />
</Layout>
