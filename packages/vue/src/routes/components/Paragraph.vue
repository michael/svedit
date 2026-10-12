<script setup lang="ts">
import { Node, TextProperty } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';

defineProps<{ path: DocumentPath }>();
</script>

<template>
	<Node :path="path">
		<div class="text max-w-screen-lg mx-auto w-full">
			<TextProperty tag="p" class="body" :path="[...path, 'content']" placeholder="Paragraph" />
		</div>
	</Node>
</template>

<style scoped>
/* Child combinator: Vue also applies this component's scoped styles to the
   root element of child components, and TextProperty's root has the class
   `text` too, so a plain `.text` would pad the text property as well. */
.node-paragraph > .text {
	padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
	padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
	padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
	padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
	padding: var(--s-6);
}
</style>
