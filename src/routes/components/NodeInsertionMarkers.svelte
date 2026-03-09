<script>
	import { getContext } from 'svelte';
	import NodeInsertionCaret from './NodeInsertionCaret.svelte';

	/**
	 * Renders insertion gap markers for a single node_array.
	 *
	 * Lives inside NodeArrayProperty so it inherits the --row CSS variable.
	 * Uses var(--row, 0) with the * 99999 multiplier trick to switch between
	 * column and row positioning/visuals in pure CSS — no container queries.
	 *
	 * Gap data is produced by NodeInsertionOverlay and published to the
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
			<NodeInsertionCaret />
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
	 * --node-cursor-caret-bg
	 * --node-cursor-caret-shadow
	 * --node-cursor-caret-border
	 * --node-cursor-caret-thickness
	 * --node-cursor-caret-inset
	 * --node-cursor-caret-radius
	 * --node-cursor-caret-z-index
	 * --node-cursor-caret-blink-duration
	 * --node-cursor-caret-animation
	 * --node-cursor-caret-row-inline-position
	 *
	 * Row/column detection uses var(--row, 0) with the * 99999 multiplier
	 * trick throughout. Shorthand:
	 *   --_R: var(--row, 0)              (1 when row, 0 when column)
	 *   --_C: calc(1 - var(--row, 0))    (1 when column, 0 when row)
	 *
	 * Inside min(): + var(--_X) * 99999px makes a branch huge → min ignores it.
	 * Inside max(): + var(--_X) * -99999px makes a branch tiny → max ignores it.
	 * Nested min/max inherit the outermost convention: if the root is min(),
	 * all branches (even inside inner max()) use + 99999px to disable.
	 */

	/* Suppress caret blink during active click on a cursor trap. */
	:global(.svedit-canvas:active) .gap-marker {
		--node-cursor-caret-animation: none;
	}

	/*
	 * Base marker positioning — anchors to the cursor trap's .svedit-selectable.
	 *
	 * Anchor CSS custom properties (set via inline style on each element):
	 *   --_ct  cursor trap (.svedit-selectable anchor-name)
	 *   --_a   placeholder element (empty arrays only)
	 *   --_f   reference item 0 (row gap narrowing)
	 *   --_s   reference item 1 (row gap narrowing)
	 *   --_n   next node (row same-line vs wrap detection)
	 *   --_c   node-array container (edge row.last cap)
	 */
	.gap-marker {
		--_eg: var(--node-cursor-edge-gap, 24px);
		--_gm: var(--node-cursor-gap-min-size, 16px);
		--_R: var(--row, 0);
		--_C: calc(1 - var(--row, 0));
		position: absolute;
		position-visibility: anchors-visible;
		pointer-events: none;
		z-index: var(--node-cursor-marker-z-index, 2);
		padding: var(--node-cursor-marker-padding, 2px);
		top: anchor(var(--_ct) top);
		left: anchor(var(--_ct) left);
		bottom: anchor(var(--_ct) bottom);
		right: anchor(var(--_ct) right);
	}

	/* --------------------------------------------------------------------- */
	/* Empty array                                                           */
	/* --------------------------------------------------------------------- */

	.gap-marker.gap-empty {
		--node-cursor-caret-row-inline-position: calc(var(--_R) * 0px + var(--_C) * 50%);
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
	/* Mid gap (between two nodes) — column uses cursor trap anchor (base    */
	/* rule). Row uses complex narrowing logic. The row branches all get     */
	/* + var(--_C) * 99999px so they're ignored in column layout.            */
	/* --------------------------------------------------------------------- */

	.gap-marker.gap-mid {
		left: min(
			calc(anchor(var(--_ct) left) + var(--_R) * 99999px),
			calc(anchor(var(--_p) right) + var(--_C) * 99999px),
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--_gm) / 2
				+ max(0px, anchor(var(--_p) right) - anchor(var(--_n) left)) * 9999
				+ var(--_C) * 99999px
			),
			calc(
				anchor(var(--_p) right)
				+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
				- max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--_gm)
				) / 2
				+ max(0px, anchor(var(--_n) left) - anchor(var(--_p) right)) * 9999
				+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
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
				calc(anchor(var(--_ct) right) + var(--_R) * 99999px),
				calc(
					anchor(var(--_n) left) + var(--_C) * 99999px
				),
				calc(
					(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
					- var(--_gm) / 2
					+ var(--_C) * 99999px
				),
				max(
					calc(
						anchor(var(--_p) right)
						- (
							max(0px, anchor(var(--_f) right) - anchor(var(--_s) left))
							+ max(
								max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)),
								var(--_gm)
							)
						) / 2
						- max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)) * 9999
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
			calc(anchor(var(--_ct) top) + var(--_C) * 99999px),
			calc(max(0px, calc(anchor(var(--_a) top) - var(--_gm))) + var(--_R) * 99999px)
		);
		bottom: min(
			calc(anchor(var(--_ct) bottom) + var(--_C) * 99999px),
			calc(anchor(var(--_a) top) + var(--_R) * 99999px)
		);
		left: min(
			calc(anchor(var(--_ct) left) + var(--_R) * 99999px),
			calc(max(0px, calc(anchor(var(--_a) left) - var(--_gm))) + var(--_C) * 99999px)
		);
		right: min(
			calc(anchor(var(--_ct) right) + var(--_R) * 99999px),
			calc(anchor(var(--_a) left) + var(--_C) * 99999px)
		);
	}

	/* Edge last: column = below last node, row = right of last node */
	.gap-edge.last {
		top: min(
			calc(anchor(var(--_ct) top) + var(--_C) * 99999px),
			calc(anchor(var(--_a) bottom) + var(--_R) * 99999px)
		);
		bottom: min(
			calc(anchor(var(--_ct) bottom) + var(--_C) * 99999px),
			calc(anchor(var(--_a) bottom) - var(--_gm) + var(--_R) * 99999px)
		);
		left: min(
			calc(anchor(var(--_ct) left) + var(--_R) * 99999px),
			calc(anchor(var(--_a) right) + var(--_C) * 99999px),
			calc(100% - var(--_gm) + var(--_C) * 99999px)
		);
		right: max(
			calc(0px + var(--_C) * -99999px),
			calc(anchor(var(--_ct) right) + var(--_R) * -99999px),
			calc(anchor(var(--_a) right) - var(--_gm) + var(--_C) * -99999px),
			calc(anchor(var(--_c) right) + var(--_C) * -99999px)
		);
	}

	/* --------------------------------------------------------------------- */
	/* Trailing gap in row with 2+ items: complex narrowing using --_f/--_s  */
	/* Overrides .gap-edge.last — must re-include col branch for both left   */
	/* (min: + 99999px to disable) and right (max: * -99999px to disable).   */
	/* --------------------------------------------------------------------- */

	.gap-marker.gap-edge.last.pair {
		left: min(
			calc(anchor(var(--_ct) left) + var(--_R) * 99999px),
			calc(anchor(var(--_a) right) + var(--_C) * 99999px),
			calc(
				anchor(var(--_a) right)
				+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
				- max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--_gm)
				) / 2
				+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
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
			calc(anchor(var(--_ct) right) + var(--_R) * -99999px),
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
			border-top: calc(var(--_C) * 1px) dashed var(--node-cursor-gap-color, var(--stroke-color));
			border-left: calc(var(--_R) * 1px) dashed var(--node-cursor-gap-color, var(--stroke-color));
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
			border: var(--node-cursor-empty-border, 1px dashed var(--node-cursor-gap-color, var(--stroke-color)));
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
			background: var(--node-cursor-symbol-bg, var(--node-cursor-gap-color, var(--stroke-color)));
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
		outline-offset: -2px;
	} */
</style>
