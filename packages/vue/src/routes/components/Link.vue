<script setup lang="ts">
import { computed } from 'vue';
import { serialize_path } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

const svedit = get_svedit_context();
const props = defineProps<{ path: DocumentPath; content: string }>();
const node = computed<Nodes['link']>(() => svedit.session.get(props.path));

function handle_click(event: MouseEvent) {
	// While editing, a plain click places the caret (opening the link
	// popover); meta/ctrl click opens the link in a new tab, like in
	// Google Docs, Word or VS Code. Read mode navigates natively.
	if (svedit.editable && (event.metaKey || event.ctrlKey) && node.value?.href) {
		event.preventDefault();
		window.open(node.value.href, '_blank', 'noopener');
	}
}
</script>

<template>
	<a
		:id="node.id"
		:data-node-id="node.id"
		:href="node?.href"
		:target="(node as any)?.target || '_self'"
		:title="svedit.editable && node?.href !== '' ? '⌘-click to open' : undefined"
		:style="`anchor-name: --${serialize_path(path)};`"
		@click="handle_click"
		>{{ content }}</a
	>
</template>

<style scoped>
/* Style empty links as wavy (like grammar mistakes) */
a:not([href]),
a[href=''],
a[href=' '] {
	text-decoration-style: wavy;
}
</style>
