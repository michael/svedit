<script>
	/**
	 * Visual insertion caret rendered inside the active insertion marker.
	 *
	 * This component is presentation-only. It reads styling tokens for
	 * color/shape/animation and switches orientation for row vs column flow.
	 */
	let { 
		/** @type {boolean} Whether the caret is in a row or column flow. */
		is_row = false 
	} = $props();
</script>

<div class="caret" class:row={is_row} role="none"></div>

<style>
	@keyframes node-cursor-caret-blink {
		0%, 60% { opacity: 1; }
		68% { opacity: 0; }
		88% { opacity: 0; }
		100% { opacity: 1; }
	}

	.caret {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: var(--node-cursor-caret-z-index, 20);
		container-type: size;
		animation: var(
			--node-cursor-caret-animation,
			node-cursor-caret-blink var(--node-cursor-caret-blink-duration, 1.1s) ease-in-out infinite
		);
	}

	.caret::before {
		content: '';
		position: absolute;
		background: var(--node-cursor-caret-bg, var(--editing-stroke-color));
		/* Broad design token so consumers can replace the entire treatment at once. */
		box-shadow: var(--node-cursor-caret-shadow, 0 0 0 0.5px oklch(1 0 0 / 1));
		border: var(--node-cursor-caret-border, none);
		border-radius: var(--node-cursor-caret-radius, 1px);
	}

	/* Horizontal caret line for vertical layouts. */
	.caret:not(.row)::before {
		left: var(--node-cursor-caret-inset, var(--node-cursor-marker-inset, 2px));
		right: var(--node-cursor-caret-inset, var(--node-cursor-marker-inset, 2px));
		top: 50%;
		height: var(--node-cursor-caret-thickness, 2px);
		transform: translateY(-0.5px);
	}

	/* Vertical caret line for horizontal layouts. */
	.caret.row::before {
		top: var(--node-cursor-caret-inset, var(--node-cursor-marker-inset, 2px));
		bottom: var(--node-cursor-caret-inset, var(--node-cursor-marker-inset, 2px));
		left: var(--node-cursor-caret-row-inline-position, 50%);
		width: var(--node-cursor-caret-thickness, 2px);
		transform: translateX(-0.5px);
	}
</style>
