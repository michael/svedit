<script>
	import Layout from './Layout.svelte';

	let { children } = $props();
</script>

<Layout>
	{@render children()}
</Layout>
