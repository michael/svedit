<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide } from 'vue';
import Svedit from '../../lib/Svedit.vue';
import { KeyMapper } from '../../lib/index.js';
import Layout from '../../routes/components/Layout.vue';
import type Session from '../../lib/Session.js';

// Tests may pass their own KeyMapper to inspect the scope stack.
const props = defineProps<{ session: Session<any>; key_mapper?: KeyMapper }>();

// Mirror the Home.vue setup so keydown events reach the
// session keymap. Without this, key_mapper.push_scope() in
// handle_canvas_focus is a no-op and dispatched Enter goes nowhere.
const key_mapper = props.key_mapper ?? new KeyMapper();
provide('key_mapper', key_mapper);

const handle_keydown = (event: KeyboardEvent) => key_mapper.handle_keydown(event);
onMounted(() => window.addEventListener('keydown', handle_keydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handle_keydown));
</script>

<template>
	<Layout>
		<Svedit :session="session" :editable="true" :path="[session.doc.document_id]" />
	</Layout>
</template>
