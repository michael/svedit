<script>
	import { Node, NodeArrayProperty } from 'svedit';
	let { path } = $props();
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
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
</style>
