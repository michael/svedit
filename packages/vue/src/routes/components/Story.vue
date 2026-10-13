<script setup lang="ts">
import { computed } from 'vue';
import { TextProperty, CustomProperty, NodeArrayProperty, Node } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

// Static assets live under the app's base URL (/vue/ in the assembled site).
const base = import.meta.env.BASE_URL;

const svedit = get_svedit_context();

const props = defineProps<{ path: DocumentPath }>();
const node = computed<Nodes['story']>(() => svedit.session.get(props.path));
const has_buttons = computed(() => node.value.buttons.nodes.length > 0);
</script>

<!-- ATTENTION: Keep the caption's children free of stray text nodes, whitespace would mess up contenteditable -->
<template>
	<Node :path="path">
		<div :class="`story layout-${node.layout} max-w-screen-lg mx-auto w-full`">
			<CustomProperty class="image-wrapper" :path="[...path, 'image']">
				<div style="width: 100%; height: 100%" contenteditable="false">
					<img
						:src="node.image || `${base}icons/image-placeholder.svg`"
						:alt="node.title.content"
						:class="{ placeholder: !node.image }"
					/>
				</div>
			</CustomProperty>
			<div class="caption">
				<TextProperty
					class="heading2"
					:path="[...path, 'title']"
					placeholder="The CTA headline should be clear and benefit-driven."
				/>
				<TextProperty
					class="body"
					:path="[...path, 'description']"
					placeholder="It should be supported by a short sentence or two to clarify the offer or value, especially if the headline is bold or emotional."
				/>
				<NodeArrayProperty
					:class="`buttons${!has_buttons ? ' empty' : ''}`"
					:path="[...path, 'buttons']"
				/>
			</div>
		</div>
	</Node>
</template>

<style scoped>
.story {
	container-type: inline-size;
	display: grid;
	grid-template-columns: 1fr;
	/* Apply padding on the sides, but only on devices that need it, e.g. iPhone with notch */
	/* Learn more about this technique here: https://kulturbanause.de/blog/websites-fuer-das-iphone-x-optimieren-weisse-balken-entfernen-viewport-anpassen-safe-area-festlegen/ */
	padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
	padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
	padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
	padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
	gap: var(--s-10);
	padding: var(--s-10) var(--s-6);
}

@media (min-width: 680px) {
	.story {
		grid-template-columns: 1fr 2fr;
	}
}

/* Prevent overflow issues when e.g. the buttons array grows larger than the container */
.story .caption {
	min-width: 0;
}

.story :deep(.buttons:not(.empty)) {
	padding-top: 24px;
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
	gap: var(--s-2);
	max-width: 100%;
	overflow-x: auto;
	overscroll-behavior: contain;
}

.story :deep(.buttons:not(.empty) > [data-type='node']) {
	flex: 0 0 auto;
	white-space: nowrap;
}

.story :deep(.buttons:focus),
.story :deep(.buttons:focus-visible) {
	outline: none;
}

.story :deep(.buttons) {
	--row: 1;
}

/* important: also add relative positioning to the parent container, so the placeholder occoupies the entire space*/
.story :deep(.buttons.empty) {
	position: relative;
}
.story :deep(.buttons.empty .empty-node-placeholder) {
	position: absolute;
}

.story img {
	display: block;
	width: 100%;
	height: auto;
}
/* Don't crop SVGs */
.story img[src*='.svg'] {
	object-fit: contain;
	object-position: center;
}

/* Placeholder styling */
.story img.placeholder {
	opacity: 0.7;
	border: 2px dashed var(--border);
	border-radius: var(--s-2);
	padding: var(--s-4);
	background: var(--background);
}

.story :deep(.heading2) {
	margin-bottom: var(--s-2);
}

.story :deep(.image-wrapper) {
	/* for now ignore clicks on the image, until we have non-text selections */
	/* pointer-events: none; */
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 280px;
	max-width: 320px;
}

@media (max-width: 680px) {
	.story :deep(.image-wrapper) {
		min-width: 100%;
		max-width: 100%;
	}
}

/* Layout styles */
.story.layout-image-right,
.story.layout-image-left {
	align-items: center;
}

@media (min-width: 680px) {
	/* Image on the right - use grid areas */
	.story.layout-image-right {
		grid-template-columns: 2fr 1fr;
		grid-template-areas: 'content image';
	}
	.story.layout-image-right > :first-child {
		grid-area: image;
	}
	.story.layout-image-right > :last-child {
		grid-area: content;
	}
}

.story.layout-stacked > div:first-child {
	grid-column: 1 / 3;
	grid-row: 1 / 2;
}

.story.layout-stacked > div:last-child {
	grid-column: 1 / 3;
	grid-row: 2 / 3;
}
</style>
