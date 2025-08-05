<script>
	import { getContext } from 'svelte';
	import Node from '../../lib/Node.svelte';
	import AnnotatedStringProperty from '../../lib/AnnotatedStringProperty.svelte';

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
	  background: var(--primary-fill-color);
		color: var(--canvas-fill-color);
		padding: var(--s-2) var(--s-4);
		min-width: 50px;
	}

	.button:hover {
		background: var(--primary-fill-color);
		color: var(--canvas-fill-color);
	  opacity: 0.8;
	}

	/*.button :global(.body) {
		min-width: 60px;
	}*/
</style>
