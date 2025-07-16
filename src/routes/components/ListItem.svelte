<script>
	import Node from '../../lib/Node.svelte';
	import AnnotatedStringProperty from '../../lib/AnnotatedStringProperty.svelte';
	import { getContext } from 'svelte';

  const svedit = getContext('svedit');
  let { path } = $props();

	// We expect the list_node to be the parent in the path
	let list_node = $derived(svedit.doc.get(path.slice(0, -2)));
</script>

<Node {path}>
	<div class="list-item" style="--list-style: {list_node.list_style};">
		<AnnotatedStringProperty path={[...path, 'content']} />
	</div>
</Node>

<style>
	.list-item {
		position: relative;
		padding-left: 3em;
	}

	.list-item::before {
		position: absolute;
		left: 0;
		top: 0;
		font-size: 1em;
		content: counter(listcounter, var(--list-style));
		color: var(--primary-fill-color);
	}

	/* CSS Counter initiation */
	:global(.list-item) {
		counter-increment: listcounter;
	}
</style>
