<script lang="ts">
	import type { Snippet } from 'svelte';
	import Layout from './components/Layout.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<Layout>
	{@render children()}
</Layout>
