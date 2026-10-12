<script setup lang="ts">
import { computed } from 'vue';
import { Node, TextProperty, CustomProperty } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

// Static assets live under the app's base URL (/vue/ in the assembled site).
const base = import.meta.env.BASE_URL;

const svedit = get_svedit_context();
const props = defineProps<{ path: DocumentPath }>();
const node = computed<Nodes['image_grid_item']>(() => svedit.session.get(props.path));
</script>

<!-- ATTENTION: Keep the caption's children free of stray text nodes, whitespace would mess up contenteditable -->
<template>
	<Node :path="path">
		<div class="image-grid-item flex-column gap-y-3">
			<CustomProperty class="image-wrapper" :path="[...path, 'image']">
				<div contenteditable="false" style="aspect-ratio: 1/1; width: 100%">
					<img
						:src="node.image || `${base}icons/image-placeholder.svg`"
						:alt="node.title.content"
						:class="{ placeholder: !node.image }"
					/>
				</div>
			</CustomProperty>
			<div class="caption flex-column gap-y-3">
				<TextProperty
					class="heading3"
					:path="[...path, 'title']"
					placeholder="Gallery item title"
				/>
				<TextProperty class="body" :path="[...path, 'description']" placeholder="Details" />
			</div>
		</div>
	</Node>
</template>

<style scoped>
.image-grid-item {
	padding: var(--s-4);
	height: 100%;
}
.image-grid-item img {
	width: 100%;
	object-fit: cover;
	height: 100%;
}

/* Don't crop SVGs */
.image-grid-item img[src*='.svg'] {
	object-fit: contain;
	object-position: center;
}

/* Placeholder styling */
.image-grid-item img.placeholder {
	opacity: 0.7;
	border-radius: var(--s-2);
	padding: var(--s-4);
	background: var(--background);
}

.image-grid-item :deep(.image-wrapper) {
	/* for now ignore clicks on the image, until we have non-text selections */
	/* pointer-events: none; */
	display: flex;
	align-items: center;
	justify-content: center;
}

@media (max-width: 680px) {
	.image-grid-item :deep(.image-wrapper) {
		min-width: 100%;
		max-width: 100%;
	}
}
</style>
