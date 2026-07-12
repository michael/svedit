<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import type { Nodes } from '../create_demo_session.js';

	const svedit = get_svedit_context();
	let {
		path,
		content,
		children
	}: { path: DocumentPath; content?: string; children?: Snippet } = $props();
	let node: Nodes['section'] = $derived(svedit.session.get(path));
</script>

<section id={node.id} class="section" data-node-id={node.id}>
	{#if children}
		{@render children()}
	{:else}
		{content}
	{/if}
</section>

<style>
	.section {
		display: block;
		background: color-mix(in oklch, var(--app-primary-text) 4.5%, var(--app-canvas-fill));
		box-shadow:
			inset 0 1px 0 color-mix(in oklch, var(--app-primary-text) 16%, transparent),
			inset 0 -1px 0 color-mix(in oklch, var(--app-primary-text) 16%, transparent);
	}

	/* Stacked sections share one hairline instead of doubling it */
	:global(.section + .section) {
		box-shadow: inset 0 -1px 0 color-mix(in oklch, var(--app-primary-text) 16%, transparent);
	}
</style>
