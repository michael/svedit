<script setup lang="ts">
import { computed } from 'vue';
import { Node, TextProperty } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

const svedit = get_svedit_context();
const props = defineProps<{ path: DocumentPath }>();

// We expect the list_node to be the parent in the path
const list_node = computed<Nodes['list']>(() => svedit.session.get(props.path.slice(0, -2)));
const list_style = computed(() => list_node.value?.layout ?? 'square');
</script>

<template>
	<Node :path="path">
		<div class="list-item" :style="`--list-style: ${list_style};`">
			<TextProperty :path="[...path, 'content']" placeholder="List item" />
		</div>
	</Node>
</template>

<style scoped>
.list-item {
	position: relative;
	padding-left: 3em;
	padding-top: 1em;
	padding-bottom: 1em;
}

.list-item::before {
	position: absolute;
	left: 0;
	top: 1em;
	width: 2.25em;
	text-align: right;
	font-size: 1em;
	content: counter(listcounter, var(--list-style));
	color: var(--accent);
}
</style>

<style>
/* CSS Counter initiation */
.list-item {
	counter-increment: listcounter;
}
</style>
