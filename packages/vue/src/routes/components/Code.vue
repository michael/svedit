<script setup lang="ts">
import { computed } from 'vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

const svedit = get_svedit_context();
const props = defineProps<{ path: DocumentPath; content: string }>();
const node = computed<Nodes['code']>(() => svedit.session.get(props.path));
</script>

<template>
	<code :id="node.id" :data-node-id="node.id">{{ content }}</code>
</template>

<style scoped>
code {
	border-radius: 0.25em;
	background: color-mix(in oklch, var(--foreground) 8%, transparent);
	padding: 0.05em 0.3em;
	font-family: inherit;
}
</style>
