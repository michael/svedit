<script>
	import { getContext } from 'svelte';
	const svedit = getContext('svedit');
	let { path, content, children } = $props();
	let node = $derived(svedit.session.get(path));
</script>

<section id={node.id} class="section" data-node-id={node.id}>
	{#if children}
		{@render children()}
	{:else}
		{content}
	{/if}
</section>

<style>
	.section {
		display: block;
		background: linear-gradient(
			180deg,
			color-mix(in oklch, var(--app-canvas-fill) 98%, var(--app-primary-text)) 0%,
			var(--app-canvas-fill) 72%
		);
		box-shadow:
			inset 0 1px 0 color-mix(in oklch, var(--app-canvas-fill) 88%, var(--app-primary-text)),
			inset 0 -1px 0 color-mix(in oklch, var(--app-canvas-fill) 88%, var(--app-primary-text));
	}

	:global(.section + .section) {
		box-shadow: inset 0 -1px 0
			color-mix(in oklch, var(--app-canvas-fill) 88%, var(--app-primary-text));
	}
</style>
