<script setup lang="ts">
import { Node, NodeArrayProperty } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';

defineProps<{ path: DocumentPath }>();
</script>

<template>
	<Node :path="path">
		<div class="list max-w-screen-md mx-auto">
			<NodeArrayProperty class="list-node-array" :path="[...path, 'list_items']" />
		</div>
	</Node>
</template>

<style scoped>
.list {
	padding: var(--s-10) var(--s-6);
	counter-reset: listcounter;
}
.list :deep(.list-node-array) {
	--row: 0;
	display: flex;
	flex-direction: column;
	gap: var(--s-4);
}
/* Use `of [data-type="node"]` to skip interleaved .node-gap elements */
.list :deep(.list-node-array > :nth-child(2n of [data-type='node']) .list-item) {
	background: color-mix(in oklab, var(--accent) 5%, transparent);
}
</style>
