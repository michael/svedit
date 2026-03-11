<script>
	/**
	 * Visual insertion caret rendered inside the active insertion marker.
	 *
	 * This component is presentation-only. It reads styling tokens for
	 * color/shape/animation and switches orientation via var(--row, 1)
	 * with the * 99999 multiplier trick — works in all browsers.
	 */
</script>

<div class="caret" role="none"></div>

<style>
	@keyframes node-caret-blink {
		0%, 60% { opacity: 1; }
		68% { opacity: 0; }
		88% { opacity: 0; }
		100% { opacity: 1; }
	}

	.caret {
		--_R: var(--row, 1);
		--_C: calc(1 - var(--row, 1));
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: var(--node-caret-z-index, 20);
		animation: var(
			--node-caret-animation,
			node-caret-blink var(--node-caret-blink-duration, 1.1s) ease-in-out infinite
		);
	}

	.caret::before {
		--_ci: var(--node-caret-inset, var(--node-caret-marker-inset, 2px));
		--_ct: var(--node-caret-thickness, 2px);
		--_cp: var(--node-caret-row-inline-position, 50%);
		content: '';
		position: absolute;
		background: var(--node-caret-bg, var(--svedit-editing-stroke));
		/* Increase the visibility of the caret by contrasting it with a box shadow that's the inverted brightness of the current text color. */
		/* Component developers must set their background color and text color on the node itself, not a child element, for this to work. */
		box-shadow: var(--node-caret-shadow, 0 0 0 0.5px oklch(from currentColor calc(1 - l) c h));
		border: var(--node-caret-border, none);
		border-radius: var(--node-caret-radius, 1px);
		/*
		 * Column: horizontal line at 50% — top=50%, bottom=50%-thickness.
		 * Row: vertical line at --_cp — left=cp, right=100%-cp-thickness.
		 * No explicit height/width — inset pairs control dimensions.
		 */
		top: min(
			calc(50% + var(--_R) * 99999px),
			calc(var(--_ci) + var(--_C) * 99999px)
		);
		bottom: min(
			calc(50% - var(--_ct) + var(--_R) * 99999px),
			calc(var(--_ci) + var(--_C) * 99999px)
		);
		left: min(
			calc(var(--_ci) + var(--_R) * 99999px),
			calc(var(--_cp) + var(--_C) * 99999px)
		);
		right: min(
			calc(var(--_ci) + var(--_R) * 99999px),
			calc(100% - var(--_cp) - var(--_ct) + var(--_C) * 99999px)
		);
		transform:
			translateY(calc(var(--_C) * -0.5px))
			translateX(calc(var(--_R) * -0.5px));
	}
</style>
