<script lang="ts">
	import { Node, NodeArrayProperty } from 'svedit';
	import type { DocumentPath } from 'svedit';

	let { path }: { path: DocumentPath } = $props();
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
