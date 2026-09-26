<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import { mention_directory } from '../mention_directory.js';
	import type { Nodes } from '../demo_schema.js';

	const svedit = get_svedit_context();
	let { path, selected }: { path: DocumentPath; selected: boolean } = $props();
	let node: Nodes['mention'] = $derived(svedit.session.get(path));
	let entry = $derived(mention_directory[node.user_id]);
</script>

<!-- Nothing here is stored in the document: only node.user_id is. An unknown
     id renders as a broken reference rather than silently disappearing. -->
<span class="mention" class:selected style="--mention-colour: {entry?.colour ?? 'currentColor'}"
	>@{entry?.name ?? node.user_id}</span
>

<style>
	.mention {
		padding: 0 0.3em;
		border-radius: 9999px;
		background: color-mix(in oklch, var(--mention-colour) 18%, transparent);
		color: var(--mention-colour);
		font-weight: 500;
	}

	/* Svedit sets user-select: none on the wrapper, so the browser never
	   paints a native selection here. The `selected` prop is how the chip
	   is told it is part of the selection. */
	.mention.selected {
		background: var(--svedit-editing-fill);
		color: var(--app-primary-text);
	}
</style>
