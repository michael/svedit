<script>
	/**
	 * Minimal cursor trap: a zero-height DOM caret landing zone for keyboard
	 * navigation. Visual cursor and gap click targets are handled by NodeCursorOverlay.svelte.
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
		pointer-events: none;
		/*
		 * Prevent a transient native caret paint while keyboard navigation moves
		 * from text into this trap and the overlay caret takes over.
		 */
		caret-color: transparent;
	}

	.svedit-selectable {
		pointer-events: none;
		user-select: none;
		caret-color: transparent;
	}
</style>
