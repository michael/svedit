<script lang="ts">
	import { getContext } from 'svelte';
	import { serialize_path } from './utils.js';
	import type { DocumentPath, SveditContext } from './types.js';

	const svedit = getContext<SveditContext>('svedit');
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
		/* Selection frame: a single 1px outline, offset -0.5px so the
		   hairline centers on the node's edge and neighboring frames merge
		   into one shared line. Alternatives tried and rejected:
		   - Plain 1px border: adjacent selected nodes stack their borders
		     into a 2px seam between them, which looks ugly.
		   - Thick translucent frame (8px border) plus an inner hairline
		     outline: multiple nested lines take more cognitive effort to
		     parse than a single line.
		   - Inset box-shadow rings (1px stroke + 8px translucent): same
		     layered-frame look, same objection.
		   Performance note: outlines don't participate in layout, so
		   selection changes can't trigger reflows. */
		position: absolute;
		background: var(--svedit-editing-fill);
		outline: 1px solid var(--svedit-editing-stroke);
		outline-offset: -0.5px;
		border-radius: 1px;
		top: anchor(top);
		left: anchor(left);
		bottom: anchor(bottom);
		right: anchor(right);
		pointer-events: none;
		z-index: 12;
	}
</style>
