<script setup lang="ts">
import { computed, inject } from 'vue';
import Node from './Node.vue';
import type { DocumentPath, SveditContext } from './types.js';

const svedit = inject<SveditContext>('svedit')!;
const props = defineProps<{ path: DocumentPath }>();
const node = computed(() => svedit.session.get(props.path));
</script>

<template>
	<Node :path="path">Unknown: {{ node.type }}.</Node>
</template>
