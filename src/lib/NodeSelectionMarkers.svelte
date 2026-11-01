<script lang="ts">
	import { getContext } from 'svelte';
	import { serialize_path, get_selection_range } from './utils.js';
	import type { SveditContext } from './types.js';

	const svedit = getContext<SveditContext>('svedit');

	// Anchor names of the selected nodes of a non-collapsed node selection
	let selected_node_anchors = $derived.by(() => {
		const selection = svedit.session.selection;
		if (selection?.type !== 'node') return [];
		const { start_offset, end_offset } = get_selection_range(selection)!;
		const array_path = serialize_path(selection.path);
		return Array.from(
			{ length: end_offset - start_offset },
			(_, index) => `${array_path}__${start_offset + index}`
		);
	});
</script>

{#if svedit.session.selection?.type === 'property'}
	<div
		class="selected-property-overlay"
		class:unfocused={!svedit.canvas_focused}
		style="position-anchor: --{serialize_path(svedit.session.selection.path)};"
	></div>
{/if}

{#each selected_node_anchors as anchor (anchor)}
	<div
		class="selected-node-overlay"
		class:unfocused={!svedit.canvas_focused}
		style="position-anchor: --{anchor};"
	></div>
{/each}

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
		background: var(--editing-muted);
		outline: 1px solid var(--editing);
		outline-offset: -0.5px;
		border-radius: 1px;
		top: anchor(top);
		left: anchor(left);
		bottom: anchor(bottom);
		right: anchor(right);
		pointer-events: none;
		z-index: 12;
	}

	.selected-node-overlay.unfocused,
	.selected-property-overlay.unfocused {
		background: oklch(from var(--editing-muted) l 0 h / alpha);
		outline-color: oklch(from var(--editing) l 0 h);
	}
</style>
