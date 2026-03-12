<script>
	import { getContext } from 'svelte';

	const svedit = getContext('svedit');

	let highlight_el = $state();

	// Reactively track when we have a non-collapsed text selection
	let has_text_selection = $derived.by(() => {
		const sel = svedit.session.selection;
		if (!sel || sel.type !== 'text') return false;
		return sel.anchor_offset !== sel.focus_offset;
	});

	// Update position whenever selection changes
	$effect(() => {
		if (!has_text_selection || !highlight_el) return;

		// Read native selection rect
		const dom_selection = window.getSelection();
		if (!dom_selection || dom_selection.rangeCount === 0) return;

		const range = dom_selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();

		if (rect.width === 0 && rect.height === 0) return;

		highlight_el.style.top = `${rect.top + window.scrollY}px`;
		highlight_el.style.left = `${rect.left + window.scrollX}px`;
		highlight_el.style.width = `${rect.width}px`;
		highlight_el.style.height = `${rect.height}px`;
	});
</script>

{#if has_text_selection}
	<div
		bind:this={highlight_el}
		class="selection-highlight-anchor"
		style="anchor-name: --selection-highlight;"
	></div>
{/if}

<style>
	.selection-highlight-anchor {
		position: absolute;
		pointer-events: none;
		z-index: -1;
	}
</style>