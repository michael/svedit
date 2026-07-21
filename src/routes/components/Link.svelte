<script lang="ts">
	import { serialize_path } from '../../lib/utils.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import type { Nodes } from '../demo_schema.js';

	const svedit = get_svedit_context();
	let { path, content }: { path: DocumentPath; content: string } = $props();
	let node: Nodes['link'] = $derived(svedit.session.get(path));

	function handle_click(event: MouseEvent) {
		// While editing, a plain click places the caret (opening the link
		// popover); meta/ctrl click opens the link in a new tab, like in
		// Google Docs, Word or VS Code. Read mode navigates natively.
		if (svedit.editable && (event.metaKey || event.ctrlKey) && node?.href) {
			event.preventDefault();
			window.open(node.href, '_blank', 'noopener');
		}
	}
</script>

<a
	id={node.id}
	data-node-id={node.id}
	href={node?.href}
	target={(node as any)?.target || '_self'}
	title={svedit.editable && node?.href !== '' ? '⌘-click to open' : undefined}
	onclick={handle_click}
	style="anchor-name: --{serialize_path(path)};">{content}</a
>

<style>
	/* Style empty links as wavy (like grammar mistakes) */
	a:not([href]), a[href=""], a[href=" "] {
		text-decoration-style: wavy;
	}
</style>