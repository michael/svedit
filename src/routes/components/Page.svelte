<script>
	import { Node, NodeArrayProperty } from 'svedit';

	let { path } = $props();
</script>

<Node {path}>
	<div class="page">
		<NodeArrayProperty class="body-node-array" path={[...path, 'body']} />
	</div>
</Node>

<style>
	:global {
		.body-node-array {
			display: grid;
			grid-template-columns: 1fr;
		}
	}
</style>
