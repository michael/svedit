<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue';
import { Svedit, Session, KeyMapper } from '@svedit/vue';
import { app_config } from '../demo_config.js';
import { document_schema } from '@svedit/demo-shared/src/demo_schema.js';
import { install_harness } from '@svedit/demo-shared/src/perftest/suite.js';

// Benchmark harness for the comparison page at /perftest: the editor and
// nothing else. The suite runs in this document via window.__svedit_perf.

const key_mapper = new KeyMapper();
provide('key_mapper', key_mapper);

const session = shallowRef<Session<typeof document_schema> | null>(null);
const mount_key = ref(0);
const editable = ref(true);
const svedit_ref = ref<{ focus_canvas: () => void }>();
const wrapper = ref<HTMLElement>();

const handle_keydown = (event: KeyboardEvent) => key_mapper.handle_keydown(event);
let uninstall: (() => void) | undefined;

onMounted(() => {
	window.addEventListener('keydown', handle_keydown);
	uninstall = install_harness({
		framework: 'Vue',
		mode: import.meta.env.DEV ? 'development' : 'production',
		async mount(doc) {
			session.value = new Session(document_schema, doc, app_config);
			mount_key.value += 1;
			await nextTick();
		},
		session: () => session.value,
		focus: () => svedit_ref.value?.focus_canvas(),
		// Vue flushes render jobs and post-flush watchers (where the editor
		// renders the DOM selection) before nextTick resolves.
		settle: () => nextTick(),
		wrapper: () => wrapper.value!
	});
});

onBeforeUnmount(() => {
	window.removeEventListener('keydown', handle_keydown);
	uninstall?.();
});
</script>

<template>
	<div ref="wrapper" class="perf-harness">
		<Svedit
			v-if="session"
			:key="mount_key"
			ref="svedit_ref"
			v-model:editable="editable"
			:session="session"
			:path="[session.doc.document_id]"
		/>
	</div>
</template>

<style scoped>
.perf-harness {
	margin: 0 auto;
}
</style>
