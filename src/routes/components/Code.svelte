<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import type { Nodes } from '../document_schema.js';

	const svedit = get_svedit_context();
	let { path, content }: { path: DocumentPath; content: string } = $props();
	let node: Nodes['code'] = $derived(svedit.session.get(path));
</script>

<code id={node.id} data-node-id={node.id}>{content}</code>

<style>
	code {
		border-radius: 0.25em;
		background: color-mix(in oklch, var(--app-primary-text) 8%, transparent);
		padding: 0.05em 0.3em;
		font-family: inherit;
	}
</style>
