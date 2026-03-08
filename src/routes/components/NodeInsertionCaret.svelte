<script>
	/**
	 * Visual insertion caret rendered inside the active insertion marker.
	 *
	 * This component is presentation-only. It reads styling tokens for
	 * color/shape/animation and switches orientation via var(--row, 0)
	 * with the * 99999 multiplier trick — works in all browsers.
	 */
</script>

<div class="caret" role="none"></div>

<style>
	@keyframes node-cursor-caret-blink {
		0%, 60% { opacity: 1; }
		68% { opacity: 0; }
		88% { opacity: 0; }
		100% { opacity: 1; }
	}

	.caret {
		--_R: var(--row, 0);
		--_C: calc(1 - var(--row, 0));
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: var(--node-cursor-caret-z-index, 20);
		animation: var(
			--node-cursor-caret-animation,
			node-cursor-caret-blink var(--node-cursor-caret-blink-duration, 1.1s) ease-in-out infinite
		);
	}

	.caret::before {
		--_ci: var(--node-cursor-caret-inset, var(--node-cursor-marker-inset, 2px));
		--_ct: var(--node-cursor-caret-thickness, 2px);
		--_cp: var(--node-cursor-caret-row-inline-position, 50%);
		content: '';
		position: absolute;
		background: var(--node-cursor-caret-bg, var(--editing-stroke-color));
		box-shadow: var(--node-cursor-caret-shadow, 0 0 0 0.5px oklch(1 0 0 / 1));
		border: var(--node-cursor-caret-border, none);
		border-radius: var(--node-cursor-caret-radius, 1px);
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
