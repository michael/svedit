<script setup lang="ts">
import { computed } from 'vue';
import { serialize_path } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

const svedit = get_svedit_context();
const props = defineProps<{ path: DocumentPath; content: string }>();
const node = computed<Nodes['highlight']>(() => svedit.session.get(props.path));
</script>

<template>
	<mark :id="node.id" :data-node-id="node.id" :style="`anchor-name: --${serialize_path(path)};`">{{
		content
	}}</mark>
</template>

<style scoped>
mark {
	background: var(--accent);
	color: white;
}
</style>
