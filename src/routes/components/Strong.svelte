<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import type { Nodes } from '../document_schema.js';

	const svedit = get_svedit_context();
	let { path, content }: { path: DocumentPath; content: string } = $props();
	let node: Nodes['strong'] = $derived(svedit.session.get(path));
</script>

<strong id={node.id} data-node-id={node.id}>{content}</strong>
