<script>
	import { getContext } from 'svelte';

	const svedit = getContext('svedit');
	let selected_node_paths = $derived(get_selected_node_paths());

	function get_selected_node_paths() {
		const paths = [];
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
		style="position-anchor: --{svedit.session.selection.path.join('-')};"
	></div>
{/if}

{#if selected_node_paths}
	{#each selected_node_paths as path (path.join('-'))}
		<div class="selected-node-overlay" style="position-anchor: --{path.join('-')};"></div>
	{/each}
{/if}

<style>
	.selected-node-overlay,
	.selected-property-overlay {
		position: absolute;
		background: var(--editing-fill-color);
		border: 1px solid var(--editing-stroke-color);
		border-radius: 2px;
		top: anchor(top);
		left: anchor(left);
		bottom: anchor(bottom);
		right: anchor(right);
		pointer-events: none;
		z-index: 12;
	}
</style>
