<script setup lang="ts">
import Svedit from '../../lib/Svedit.vue';
import Layout from '../../routes/components/Layout.vue';
import type Session from '../../lib/Session.js';

defineProps<{ session: Session<any> }>();
</script>

<template>
	<Layout>
		<Svedit :session="session" :editable="true" :path="[session.doc.document_id]" />
		<input data-testid="external-input" aria-label="External input" />
	</Layout>
</template>
