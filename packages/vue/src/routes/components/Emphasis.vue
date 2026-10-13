<script setup lang="ts">
import { computed } from 'vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

const svedit = get_svedit_context();
const props = defineProps<{ path: DocumentPath; content: string }>();
const node = computed<Nodes['emphasis']>(() => svedit.session.get(props.path));
</script>

<template>
	<em :id="node.id" :data-node-id="node.id">{{ content }}</em>
</template>
