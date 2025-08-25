<script>
	import { getContext } from 'svelte';
	import { Node, AnnotatedStringProperty } from 'svedit';
	const svedit = getContext('svedit');

	let { path } = $props();
	let node = $derived(svedit.doc.get(path));
</script>

<Node {path}>
	<a href={node.href} class="button">
		<AnnotatedStringProperty class="body" path={[...path, 'label']} placeholder="Call to Action" />
	</a>
</Node>

<style>
	.button {
    display: block;
    text-decoration: none;
    border-radius: var(--s-2);
	  background: var(--primary-fill-color);
		color: var(--canvas-fill-color);
		padding: var(--s-2) var(--s-4);
	}

	.button:hover {
		background: var(--primary-fill-color);
		color: var(--canvas-fill-color);
	  opacity: 0.8;
	}
</style>
