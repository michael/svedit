<script setup lang="ts">
import { computed } from 'vue';
import { Node, TextProperty } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

const svedit = get_svedit_context();

const props = defineProps<{ path: DocumentPath }>();
const node = computed<Nodes['button']>(() => svedit.session.get(props.path));
</script>

<template>
	<Node :path="path">
		<component
			:is="svedit.editable ? 'div' : 'a'"
			:href="svedit.editable ? undefined : node.href"
			class="button"
		>
			<TextProperty class="body" :path="[...path, 'content']" placeholder="Call to Action" />
		</component>
	</Node>
</template>

<style scoped>
.button {
	display: block;
	text-decoration: none;
	border-radius: var(--s-2);
	background: var(--accent);
	color: var(--background);
	padding: var(--s-2) var(--s-4);
}

.button:hover {
	background: var(--accent);
	color: var(--background);
	opacity: 0.8;
}
</style>
