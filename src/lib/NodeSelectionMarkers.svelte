<script lang="ts">
	import { getContext } from 'svelte';
	import { serialize_path } from './utils.js';
	import type { DocumentPath } from './types.js';

	const svedit = getContext<any>('svedit');
	let selected_node_paths = $derived(get_selected_node_paths());

	function get_selected_node_paths(): DocumentPath[] | undefined {
		const paths: DocumentPath[] = [];
		const selection = svedit.session.selection;
		if (!selection) return;
		if (selection.type !== 'node' || selection.anchor_offset === selection.focus_offset) return;

		const start = Math.min(selection.anchor_offset, selection.focus_offset);
		const end = Math.max(selection.anchor_offset, selection.focus_offset);
		for (let index = start; index < end; index++) {
			paths.push([...selection.path, index]);
		}
		return paths;
	}
</script>

{#if svedit.session.selection?.type === 'property'}
	<div
		class="selected-property-overlay"
		style="position-anchor: --{serialize_path(svedit.session.selection.path)};"
	></div>
{/if}

{#if selected_node_paths}
	{#each selected_node_paths as path (serialize_path(path))}
		<div class="selected-node-overlay" style="position-anchor: --{serialize_path(path)};"></div>
	{/each}
{/if}

<style>
	.selected-node-overlay,
	.selected-property-overlay {
		position: absolute;
		background: var(--svedit-editing-fill);
		border: 1px solid var(--svedit-editing-stroke);
		border-radius: 2px;
		top: anchor(top);
		left: anchor(left);
		bottom: anchor(bottom);
		right: anchor(right);
		pointer-events: none;
		z-index: 12;
	}
</style>
