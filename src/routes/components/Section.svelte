<script>
	import { getContext } from 'svelte';
	const svedit = getContext('svedit');
	let { path, content, children } = $props();
	let node = $derived(svedit.session.get(path));
</script>

<section id={node.id} data-node-id={node.id}>
	{#if children}
		{@render children()}
	{:else}
		{content}
	{/if}
</section>

<style>
	section {
		display: block;
		background: color-mix(in oklab, var(--app-primary-fill) 5%, transparent);
	}
</style>
