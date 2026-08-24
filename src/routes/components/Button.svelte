<script lang="ts">
	import { Node, TextProperty } from 'svedit';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import type { Nodes } from '../demo_schema.js';

	const svedit = get_svedit_context();

	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['button'] = $derived(svedit.session.get(path));
</script>

<Node {path}>
	<svelte:element
		this={svedit.editable ? 'div' : 'a'}
		href={svedit.editable ? undefined : node.href}
		class="button"
	>
		<TextProperty class="body" path={[...path, 'content']} placeholder="Call to Action" />
	</svelte:element>
</Node>

<style>
	.button {
		display: block;
		text-decoration: none;
		border-radius: var(--s-2);
		background: var(--accent);
		color: var(--background);
		padding: var(--s-2) var(--s-4);
	}

	.button:hover {
		background: var(--accent);
		color: var(--background);
		opacity: 0.8;
	}
</style>
