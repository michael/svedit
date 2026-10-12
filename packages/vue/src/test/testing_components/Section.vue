<script setup lang="ts">
import type { DocumentPath } from '../../lib/types.js';

defineProps<{ path?: DocumentPath; content?: string }>();
</script>

<template>
	<section><slot /></section>
</template>
