<script lang="ts">
	import { serialize_path } from '../../lib/utils.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import type { Nodes } from '../demo_schema.js';

	const svedit = get_svedit_context();
	let { path, content }: { path: DocumentPath; content: string } = $props();
	let node: Nodes['link'] = $derived(svedit.session.get(path));
</script>

<a
	id={node.id}
	data-node-id={node.id}
	href={node?.href}
	target={(node as any)?.target || '_self'}
	style="anchor-name: --{serialize_path(path)};">{content}</a
>
