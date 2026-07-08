<script>
	import { getContext } from 'svelte';
	const svedit = getContext('svedit');
	let { path, content } = $props();
	let node = $derived(svedit.session.get(path));
</script>

<code id={node.id} data-node-id={node.id}>{content}</code>

<style>
	code {
		border-radius: 0.25em;
		background: color-mix(in oklch, var(--app-primary-text) 8%, transparent);
		padding: 0.05em 0.3em;
		font-family: inherit;
	}
</style>
