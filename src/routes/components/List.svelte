<script lang="ts">
	import { Node, NodeArrayProperty } from 'svedit';
	import type { DocumentPath } from 'svedit';
	let { path }: { path: DocumentPath } = $props();
</script>

<Node {path}>
	<div class="list max-w-screen-md mx-auto">
		<NodeArrayProperty class="list-node-array" path={[...path, 'list_items']} />
	</div>
</Node>

<style>
	.list {
		padding: var(--s-10) var(--s-6);
		counter-reset: listcounter;
	}
	.list :global(.list-node-array) {
		--row: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	/* Use `of [data-type="node"]` to skip interleaved .node-gap elements */
	.list :global(.list-node-array > :nth-child(2n of [data-type="node"]) .list-item) {
		background: color-mix(in oklab, var(--app-primary-fill) 5%, transparent);
	}
</style>
