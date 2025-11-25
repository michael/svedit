<script>
	import Svedit from '../../lib/Svedit.svelte';
	import Layout from '../../routes/components/Layout.svelte';

	let { editor_state } = $props();
</script>

<Layout>
	<Svedit {editor_state} editable={true} path={[editor_state.document_id]} />
</Layout>
