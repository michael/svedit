<script lang="ts">
	import { Node, TextProperty } from 'svedit';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import type { Nodes } from '../demo_schema.js';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();

	// We expect the list_node to be the parent in the path
	let list_node: Nodes['list'] = $derived(svedit.session.get(path.slice(0, -2)));
	let list_style = $derived(list_node?.layout ?? 'square');
</script>

<Node {path}>
	<div class="list-item" style="--list-style: {list_style};">
		<TextProperty path={[...path, 'content']} placeholder="List item" />
	</div>
</Node>

<style>
	.list-item {
		position: relative;
		padding-left: 3em;
		padding-top: 1em;
		padding-bottom: 1em;
	}

	.list-item::before {
		position: absolute;
		left: 0;
		top: 1em;
		font-size: 1em;
		content: counter(listcounter, var(--list-style));
		color: var(--app-primary-fill);
	}

	/* CSS Counter initiation */
	:global(.list-item) {
		counter-increment: listcounter;
	}
</style>
