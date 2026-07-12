<script lang="ts">
	import { serialize_path } from '../../lib/utils.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import type { Nodes } from '../create_demo_session.js';

	const svedit = get_svedit_context();
	let { path, content }: { path: DocumentPath; content: string } = $props();
	let node: Nodes['highlight'] = $derived(svedit.session.get(path));
</script>

<mark id={node.id} data-node-id={node.id} style="anchor-name: --{serialize_path(path)};"
	>{content}</mark
>

<style>
	mark {
		background: var(--app-primary-fill);
		color: white;
	}
</style>
