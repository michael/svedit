<script setup lang="ts">
import { Node, NodeArrayProperty } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';

defineProps<{ path: DocumentPath }>();
</script>

<template>
	<Node :path="path">
		<div class="page">
			<NodeArrayProperty class="body-node-array" :path="[...path, 'body']" />
		</div>
	</Node>
</template>

<style>
.body-node-array {
	display: grid;
	grid-template-columns: 1fr;
}
</style>
