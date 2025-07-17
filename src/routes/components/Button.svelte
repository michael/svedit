<script>
	import { getContext } from 'svelte';
	import Node from '../../lib/Node.svelte';
	import AnnotatedStringProperty from '../../lib/AnnotatedStringProperty.svelte';

	const svedit = getContext('svedit');

	let { path } = $props();
	let node = $derived(svedit.doc.get(path));
</script>

<Node {path}>
	<button class="button">
		<AnnotatedStringProperty class="body" path={[...path, 'label']} />
	</button>
</Node>

<style>
	.button {
	  background: var(--primary-fill-color);
		color: var(--canvas-fill-color);
		padding: var(--s-2);
		min-width: 50px;
	}

	.button:hover {
		background: var(--primary-fill-color);
		color: var(--canvas-fill-color);
	  opacity: 0.8;
	}

	.button :global(.body) {
		min-width: 50px;
	}
</style>
