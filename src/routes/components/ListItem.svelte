<script>
	import Node from '../../lib/Node.svelte';
	import AnnotatedStringProperty from '../../lib/AnnotatedStringProperty.svelte';
	import { getContext } from 'svelte';

  const svedit = getContext('svedit');
  let { path } = $props();

	// We expect the list_node to be the parent in the path
	let list_node = $derived(svedit.doc.get(path.slice(0, -2)));
	let list_style = $derived(get_list_style_from_layout(list_node?.layout));

	function get_list_style_from_layout(layout) {
		if (layout === 1) return 'square';
		if (layout === 2) return 'disc';
		if (layout === 3) return 'decimal-leading-zero';
		if (layout === 4) return 'lower-latin';
		if (layout === 5) return 'upper-roman';
		return 'square';
	}
</script>

<Node {path}>
	<div class="list-item" style="--list-style: {list_style};">
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
