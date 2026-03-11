<script>
	import { getContext } from 'svelte';
	import NodeCursor from './NodeCursor.svelte';

	/**
	 * Renders insertion gap markers for a single node_array.
	 *
	 * Lives inside NodeArrayProperty so it inherits the --row CSS variable.
	 * Uses var(--row, 1) with the * 99999 multiplier trick to switch between
	 * column and row positioning/visuals in pure CSS — no container queries.
	 *
	 * Gap data is produced by node_gap_computation and published to the
	 * svedit context. This component reads and renders it.
	 */

	let { path } = $props();

	const svedit = getContext('svedit');
	let path_str = $derived(path.join('.'));
	// Per-path signal: only re-evaluates when THIS path's gaps change.
	let gap_signal = $derived(svedit.insertion_gap_data?.get_gaps(path_str));
	let my_gaps = $derived(gap_signal?.gaps ?? []);
	let cursor_gap_key = $derived(svedit.insertion_gap_data?.cursor_gap_key);
</script>

{#each my_gaps as gap (gap.key)}
	<div
		class="gap-marker {gap.type}"
		class:active={gap.key === cursor_gap_key}
		class:first={gap.is_first}
		class:last={gap.is_last}
		class:pair={gap.has_pair}
		style={gap.vars}
		contenteditable="false"
	>
		{#if gap.key === cursor_gap_key}
			<NodeCursor />
		{/if}
	</div>
{/each}

<style>
	/*
	 * Public customization tokens (set on an ancestor or this component):
	 * --node-cursor-gap-color
	 * --node-cursor-symbol-size
	 * --node-cursor-symbol-stroke
	 * --node-cursor-symbol-gap
	 * --node-cursor-symbol-bg
	 * --node-cursor-symbol-mask
	 * --node-cursor-marker-inset
	 * --node-cursor-edge-gap
	 * --node-cursor-gap-min-size
	 * --node-cursor-marker-padding
	 * --node-cursor-marker-z-index
	 * --node-cursor-line-border
	 * --node-cursor-empty-border
	 * --node-cursor-empty-border-radius
	 * --node-cursor-bg
	 * --node-cursor-shadow
	 * --node-cursor-border
	 * --node-cursor-thickness
	 * --node-cursor-inset
	 * --node-cursor-radius
	 * --node-cursor-z-index
	 * --node-cursor-blink-duration
	 * --node-cursor-animation
	 * --node-cursor-row-inline-position
	 *
	 * Row/column detection uses var(--row, 1) with the * 99999 multiplier
	 * trick throughout. Shorthand:
	 *   --_R: var(--row, 1)              (1 when row, 0 when column)
	 *   --_C: calc(1 - var(--row, 1))    (1 when column, 0 when row)
	 *
	 * Inside min(): + var(--_X) * 99999px makes a branch huge → min ignores it.
	 * Inside max(): + var(--_X) * -99999px makes a branch tiny → max ignores it.
	 * Nested min/max inherit the outermost convention: if the root is min(),
	 * all branches (even inside inner max()) use + 99999px to disable.
	 */

	/* Suppress caret blink during active click on a node gap. */
	:global(.svedit-canvas:active) .gap-marker {
		--node-cursor-animation: none;
	}

	/*
	 * Base marker positioning.
	 *
	 * Each subclass (gap-empty, gap-mid, gap-edge) provides its own
	 * top/left/bottom/right anchored to NODE elements directly — never
	 * to the NodeGap .svedit-selectable. This avoids chained anchor
	 * positioning (marker → selectable → node) which fails in some
	 * layouts.
	 *
	 * Anchor CSS custom properties (set via inline style on each element):
	 *   --_ct  node gap (.svedit-selectable anchor-name, unused by markers)
	 *   --_a   adjacent node (edge gaps) or placeholder (empty arrays)
	 *   --_p   previous node (mid gaps)
	 *   --_n   next node (mid gaps, row same-line vs wrap detection)
	 *   --_f   reference item 0 (row gap narrowing)
	 *   --_s   reference item 1 (row gap narrowing)
	 *   --_c   node-array container (edge row.last cap)
	 */
	.gap-marker {
		--_eg: var(--node-cursor-edge-gap, 24px);
		--_gm: var(--node-cursor-gap-min-size, 16px);
		--_R: var(--row, 1);
		--_C: calc(1 - var(--row, 1));
		position: absolute;
		position-visibility: anchors-visible;
		pointer-events: none;
		z-index: var(--node-cursor-marker-z-index, 2);
		padding: var(--node-cursor-marker-padding, 2px);
		margin: 0 !important; /* prevent unwanted margin from parent elements */
	}

	/* --------------------------------------------------------------------- */
	/* Empty array                                                           */
	/* --------------------------------------------------------------------- */

	.gap-marker.gap-empty {
		--node-cursor-row-inline-position: calc(var(--_R) * 0px + var(--_C) * 50%);
		top: anchor(var(--_a) top);
		left: anchor(var(--_a) left);
		bottom: anchor(var(--_a) bottom);
		right: max(
			calc(anchor(var(--_a) right) + var(--_R) * -99999px),
			calc(anchor(var(--_a) right) + var(--_C) * -99999px),
			calc(anchor(var(--_a) left) - var(--_eg) + var(--_C) * -99999px)
		);
	}

	/* --------------------------------------------------------------------- */
	/* Mid gap (between two nodes) — anchors directly to --_p and --_n.     */
	/* Column: spans from prev bottom to next top, with a centering branch  */
	/* that guarantees at least --_gm height when the gap is too small.     */
	/* Row: spans prev node. Row left/right use complex narrowing logic;    */
	/* row branches all get + var(--_C) * 99999px so they're ignored in     */
	/* column layout.                                                        */
	/* --------------------------------------------------------------------- */

	.gap-marker.gap-mid {
		top: min(
			calc(anchor(var(--_p) bottom) + var(--_R) * 99999px),
			calc(
				(anchor(var(--_p) bottom) + anchor(var(--_n) top)) / 2
				- var(--_gm) / 2
				+ var(--_R) * 99999px
			),
			calc(anchor(var(--_p) top) + var(--_C) * 99999px)
		);
		bottom: min(
			calc(anchor(var(--_n) top) + var(--_R) * 99999px),
			calc(
				(anchor(var(--_p) bottom) + anchor(var(--_n) top)) / 2
				- var(--_gm) / 2
				+ var(--_R) * 99999px
			),
			calc(anchor(var(--_p) bottom) + var(--_C) * 99999px)
		);
		left: min(
			calc(anchor(var(--_p) left) + var(--_R) * 99999px),
			calc(anchor(var(--_p) right) + var(--_C) * 99999px),
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--_gm) / 2
				+ max(0px, anchor(var(--_p) right) - anchor(var(--_n) left)) * 9999
				+ var(--_C) * 99999px
			),
			/* Wrap narrowing: centers marker in a gap-width region at prev_right.
			   The + 0.5px disables this branch for zero-gap grids (items touching)
			   where gap/2 - max(gap,--_gm)/2 would incorrectly shift left by 8px. */
			calc(
				anchor(var(--_p) right)
				+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
				- max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--_gm)
				) / 2
				+ max(0px, anchor(var(--_n) left) - anchor(var(--_p) right)) * 9999
				+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left) + 0.5px) * 9999
				+ var(--_C) * 99999px
			),
			calc(100% - var(--_gm) + var(--_C) * 99999px),
			calc(
				100% - max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--_gm)
				)
				+ max(0px,
					(max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)))
					- (anchor(var(--_c) right) - anchor(var(--_p) right))
					- 0.5px
				) * 9999
				+ max(0px, anchor(var(--_n) left) - anchor(var(--_p) right)) * 9999
				+ var(--_C) * 99999px
			)
		);
		right: max(
			calc(0px + var(--_C) * -99999px),
			min(
				calc(anchor(var(--_p) right) + var(--_R) * 99999px),
				calc(
					anchor(var(--_n) left) + var(--_C) * 99999px
				),
				calc(
					(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
					- var(--_gm) / 2
					+ var(--_C) * 99999px
				),
				max(
					/* Symmetric right-side narrowing. The + 0.5px mirrors the left
					   fix: disables for zero-gap grids to prevent 8px inward shift. */
					calc(
						anchor(var(--_p) right)
						- (
							max(0px, anchor(var(--_f) right) - anchor(var(--_s) left))
							+ max(
								max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)),
								var(--_gm)
							)
						) / 2
						- max(0px, anchor(var(--_s) left) - anchor(var(--_f) right) + 0.5px) * 9999
						+ var(--_C) * 99999px
					),
					calc(
						anchor(var(--_p) right) - var(--_gm)
						- max(0px,
							(anchor(var(--_p) right) - anchor(var(--_c) right))
							- (max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)))
							+ 0.5px
						) * 9999
						+ var(--_C) * 99999px
					),
					calc(
						anchor(var(--_p) right) - var(--_gm)
						- max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
						+ var(--_C) * 99999px
					),
					calc(
						anchor(var(--_p) right)
						- (anchor(var(--_n) left) - anchor(var(--_p) right)) * 9999
						+ var(--_C) * 99999px
					),
					min(
						calc(anchor(var(--_c) right) + var(--_C) * 99999px),
						calc(anchor(var(--_p) right) - var(--_eg) + var(--_C) * 99999px)
					)
				)
			)
		);
	}

	/* --------------------------------------------------------------------- */
	/* Edge gaps                                                             */
	/* --------------------------------------------------------------------- */

	.gap-marker.gap-edge {
		min-height: var(--_gm);
		min-width: var(--_gm);
	}

	/* Edge first: column = above first node, row = left of first node */
	.gap-edge.first {
		top: min(
			calc(anchor(var(--_a) top) + var(--_C) * 99999px),
			calc(max(0px, calc(anchor(var(--_a) top) - var(--_gm))) + var(--_R) * 99999px)
		);
		bottom: min(
			calc(anchor(var(--_a) bottom) + var(--_C) * 99999px),
			calc(anchor(var(--_a) top) + var(--_R) * 99999px)
		);
		left: min(
			calc(anchor(var(--_a) left) + var(--_R) * 99999px),
			calc(max(0px, calc(anchor(var(--_a) left) - var(--_gm))) + var(--_C) * 99999px)
		);
		right: min(
			calc(anchor(var(--_a) right) + var(--_R) * 99999px),
			calc(anchor(var(--_a) left) + var(--_C) * 99999px)
		);
	}

	/* Edge last: column = below last node, row = right of last node */
	.gap-edge.last {
		top: min(
			calc(anchor(var(--_a) top) + var(--_C) * 99999px),
			calc(anchor(var(--_a) bottom) + var(--_R) * 99999px)
		);
		bottom: min(
			calc(anchor(var(--_a) bottom) + var(--_C) * 99999px),
			calc(anchor(var(--_a) bottom) - var(--_gm) + var(--_R) * 99999px)
		);
		left: min(
			calc(anchor(var(--_a) left) + var(--_R) * 99999px),
			calc(anchor(var(--_a) right) + var(--_C) * 99999px),
			calc(100% - var(--_gm) + var(--_C) * 99999px)
		);
		right: max(
			calc(0px + var(--_C) * -99999px),
			calc(anchor(var(--_a) right) + var(--_R) * -99999px),
			calc(anchor(var(--_a) right) - var(--_gm) + var(--_C) * -99999px),
			calc(anchor(var(--_c) right) + var(--_C) * -99999px)
		);
	}

	/* --------------------------------------------------------------------- */
	/* Trailing gap in row with 2+ items: complex narrowing using --_f/--_s  */
	/* Overrides .gap-edge.last — must re-include col branch for both left   */
	/* (min: + 99999px to disable) and right (max: * -99999px to disable).   */
	/* --------------------------------------------------------------------- */

	/* Purpose of this + 0.5px: disable for zero-gap grids (see .gap-mid comment). */
	.gap-marker.gap-edge.last.pair {
		left: min(
			calc(anchor(var(--_a) left) + var(--_R) * 99999px),
			calc(anchor(var(--_a) right) + var(--_C) * 99999px),
			calc(
				anchor(var(--_a) right)
				+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
				- max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--_gm)
				) / 2
				+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
				+ max(0px, anchor(var(--_a) right) - anchor(var(--_c) right) + 0.5px) * 9999
				+ var(--_C) * 99999px
			),
			calc(100% - var(--_gm) + var(--_C) * 99999px),
			calc(
				100% - max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--_gm)
				)
				+ max(0px,
					(max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)))
					- (anchor(var(--_c) right) - anchor(var(--_a) right))
					- 0.5px
				) * 9999
				+ var(--_C) * 99999px
			)
		);
		right: max(
			calc(anchor(var(--_a) right) + var(--_R) * -99999px),
			calc(0px + var(--_C) * -99999px),
			calc(
				anchor(var(--_a) right)
				- (
					max(0px, anchor(var(--_f) right) - anchor(var(--_s) left))
					+ max(
						max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)),
						var(--_gm)
					)
				) / 2
				- max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)) * 9999
				- max(0px, anchor(var(--_c) right) - anchor(var(--_a) right) + 0.5px) * 9999
				+ var(--_C) * -99999px
			),
			calc(
				anchor(var(--_a) right) - var(--_gm)
				- max(0px,
					(anchor(var(--_a) right) - anchor(var(--_c) right))
					- (max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)))
					+ 0.5px
				) * 9999
				+ var(--_C) * -99999px
			),
			calc(
				anchor(var(--_a) right) - var(--_gm)
				- max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
				+ var(--_C) * -99999px
			),
			min(
				calc(anchor(var(--_c) right) + var(--_C) * -99999px),
				calc(anchor(var(--_a) right) - var(--_eg) + var(--_C) * -99999px)
			)
		);
	}

	/* --------------------------------------------------------------------- */
	/* Marker visuals (line + symbol). Hidden when active (caret shows).     */
	/* --------------------------------------------------------------------- */

	.gap-marker:not(.active) {
		&::before {
			content: '';
			position: absolute;
			--gap-center: calc( var(--node-cursor-symbol-size, 6px) / 2 + var(--node-cursor-symbol-gap, 4px) );
		}

		/* Dashed line: horizontal (column) or vertical (row).
		   Column: top=50% bottom=50% → zero height, border-top is the line.
		   Row: left=50% right=50% → zero width, border-left is the line.
		   No explicit height/width — inset pairs control dimensions. */
		&:not(.gap-empty)::before {
			--_mi: var(--node-cursor-marker-inset, 2px);
			top: min(
				calc(50% + var(--_R) * 99999px),
				calc(var(--_mi) + var(--_C) * 99999px)
			);
			bottom: min(
				calc(50% + var(--_R) * 99999px),
				calc(var(--_mi) + var(--_C) * 99999px)
			);
			left: min(
				calc(var(--_mi) + var(--_R) * 99999px),
				calc(50% + var(--_C) * 99999px)
			);
			right: min(
				calc(var(--_mi) + var(--_R) * 99999px),
				calc(50% + var(--_C) * 99999px)
			);
			border-top: calc(var(--_C) * 1px) dashed var(--node-cursor-gap-color, var(--svedit-canvas-stroke));
			border-left: calc(var(--_R) * 1px) dashed var(--node-cursor-gap-color, var(--svedit-canvas-stroke));
			transform:
				translateY(calc(var(--_C) * -0.5px))
				translateX(calc(var(--_R) * -0.5px));
			mask-image: radial-gradient(
				circle at center,
				transparent calc(var(--gap-center) - 0.5px),
				black var(--gap-center)
			);
		}

		/* Empty array marker (dashed outline for discoverability). */
		&.gap-empty::before {
			inset: 0px;
			border: var(--node-cursor-empty-border, 1px dashed var(--node-cursor-gap-color, var(--svedit-canvas-stroke)));
			border-radius: var(--node-cursor-empty-border-radius, 3px);
		}

		/* Centered insertion symbol (default mask renders a plus). */
		&::after {
			content: '';
			position: absolute;
			width: var(--node-cursor-symbol-size, 6px);
			height: var(--node-cursor-symbol-size, 6px);
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background: var(--node-cursor-symbol-bg, var(--node-cursor-gap-color, var(--svedit-canvas-stroke)));
			mask: var(--node-cursor-symbol-mask,
				linear-gradient(black, black) center / 100% var(--node-cursor-symbol-stroke, 1px) no-repeat,
				linear-gradient(black, black) center / var(--node-cursor-symbol-stroke, 1px) 100% no-repeat
			);
		}
	}

	/* Debugging styles  */
	/* :global([data-type="node_array"]) {
		outline: 0.1px solid green;
	}
	.gap-marker {
		outline: 0.1px solid blue;
		outline-offset: 0.5px;
	} */
</style>
