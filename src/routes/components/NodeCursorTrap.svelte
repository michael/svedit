<script>
	/**
	 * Invisible keyboard cursor trap.
	 *
	 * This zero-height element allows `.svedit-selectable` to receive a DOM caret
	 * position when arrow-key navigation moves across node boundaries. Visual
	 * insertion affordances are rendered by `NodeInsertionOverlay.svelte`.
	 */
	let { path, type } = $props();

	let anchor_name = $derived(`--ct-${path.join('-')}-${type}`);
</script>

<div
	class="cursor-trap {type}"
	data-type={type}
	style="anchor-name: {anchor_name};"
>
	<div class="svedit-selectable"><br /></div>
</div>

<style>
	.cursor-trap {
		height: 0;
		overflow: visible;
		outline: none;
	}
	.svedit-selectable {
		user-select: none;
	}
	.cursor-trap, .svedit-selectable {
		pointer-events: none;
		/*
		 * Prevent transient native caret paint while keyboard navigation moves
		 * from text into this trap and the overlay caret takes over.
		 */
		caret-color: transparent;
	}
</style>
