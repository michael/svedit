<script setup lang="ts">
import { Node, NodeArrayProperty } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';

defineProps<{ path: DocumentPath }>();
</script>

<template>
	<Node :path="path">
		<div class="image-grid max-w-screen-lg mx-auto">
			<NodeArrayProperty class="image-grid-items" :path="[...path, 'image_grid_items']" />
		</div>
	</Node>
</template>

<style scoped>
.image-grid {
	width: 100%;
	padding: var(--s-6);
	--row: 1;
}

.image-grid :deep(.image-grid-items) {
	padding: calc(var(--s-10) * 3) 0;
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	row-gap: var(--s-2);
	align-items: stretch;
}

/* Tablet screens */
@media (max-width: 768px) {
	.image-grid :deep(.image-grid-items) {
		grid-template-columns: repeat(2, 1fr);
	}
}

/* Mobile screens */
@media (max-width: 480px) {
	.image-grid {
		--row: 0;
	}
	.image-grid :deep(.image-grid-items) {
		grid-template-columns: repeat(1, 1fr);
	}
}
</style>
