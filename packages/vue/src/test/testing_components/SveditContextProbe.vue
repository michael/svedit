<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted } from 'vue';
import Overlays from '../../routes/components/Overlays.vue';
import type { SveditContext } from '../../lib/types.js';

const context = inject<SveditContext>('svedit')!;
const test_global = globalThis as typeof globalThis & {
	__svedit_ctx_for_test?: SveditContext;
};

onMounted(() => {
	test_global.__svedit_ctx_for_test = context;
});

onBeforeUnmount(() => {
	if (test_global.__svedit_ctx_for_test === context) {
		delete test_global.__svedit_ctx_for_test;
	}
});
</script>

<template>
	<Overlays />
</template>
