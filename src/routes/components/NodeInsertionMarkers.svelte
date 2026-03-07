<script>
	import { getContext } from 'svelte';
	import NodeInsertionCaret from './NodeInsertionCaret.svelte';

	/**
	 * Renders insertion gap markers for a single node_array.
	 *
	 * Lives inside NodeArrayProperty so it inherits the --row CSS variable.
	 * Uses @container style(--row: 1) for row/column orientation (same
	 * pattern as NodeCursorTrap.svelte).
	 *
	 * Gap data is produced by NodeInsertionOverlay and published to the
	 * svedit context. This component reads and renders it.
	 */

	let { path } = $props();

	const svedit = getContext('svedit');
	let path_str = $derived(path.join('.'));
	let my_gaps = $derived(svedit.insertion_gap_data?.gaps_by_path?.get(path_str) ?? []);
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
	 */

	/* Suppress caret blink during active click on a cursor trap. */
	:global(.svedit-canvas:active) .gap-marker {
		--node-cursor-caret-animation: none;
	}

	/* Empty horizontal: caret at the left boundary. */
	@container style(--row: 1) {
		.gap-marker.gap-empty {
			--node-cursor-caret-row-inline-position: 0px;
		}
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
		top: anchor(var(--_a) top);
		left: anchor(var(--_a) left);
		bottom: anchor(var(--_a) bottom);
		right: anchor(var(--_a) right);
	}

	@container style(--row: 1) {
		.gap-marker.gap-empty {
			right: max(anchor(var(--_a) right), calc(anchor(var(--_a) left) - var(--_eg)));
		}
	}

	/* --------------------------------------------------------------------- */
	/* Mid gap (between two nodes) — column layout is just the cursor trap   */
	/* anchor (base rule). Row layout uses complex narrowing logic.           */
	/* --------------------------------------------------------------------- */

	@container style(--row: 1) {
		.gap-marker.gap-mid {
			left: min(
				anchor(var(--_p) right),
				calc(
					(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
					- var(--_gm) / 2
					+ max(0px, anchor(var(--_p) right) - anchor(var(--_n) left)) * 9999
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
				),
				calc(100% - var(--_gm)),
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
				)
			);
			right: max(0px, min(
				anchor(var(--_n) left),
				calc(
					(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
					- var(--_gm) / 2
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
					),
					calc(
						anchor(var(--_p) right) - var(--_gm)
						- max(0px,
							(anchor(var(--_p) right) - anchor(var(--_c) right))
							- (max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)))
							+ 0.5px
						) * 9999
					),
					calc(
						anchor(var(--_p) right) - var(--_gm)
						- max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
					),
					calc(
						anchor(var(--_p) right)
						- (anchor(var(--_n) left) - anchor(var(--_p) right)) * 9999
					),
					min(
						anchor(var(--_c) right),
						calc(anchor(var(--_p) right) - var(--_eg))
					)
				)
			));
		}
	}

	/* --------------------------------------------------------------------- */
	/* Edge gaps                                                             */
	/* --------------------------------------------------------------------- */

	.gap-marker.gap-edge {
		min-height: var(--_gm);
		min-width: var(--_gm);
	}

	/* Column edge: first (above first node) */
	.gap-edge.first {
		bottom: anchor(var(--_a) top);
		top: max(0px, calc(anchor(var(--_a) top) - var(--_gm)));
	}

	/* Column edge: last (below last node) */
	.gap-edge.last {
		top: anchor(var(--_a) bottom);
		bottom: calc(anchor(var(--_a) bottom) - var(--_gm));
	}

	/* Row edge overrides */
	@container style(--row: 1) {
		.gap-edge.first {
			top: anchor(var(--_ct) top);
			bottom: anchor(var(--_ct) bottom);
			right: anchor(var(--_a) left);
			left: max(0px, calc(anchor(var(--_a) left) - var(--_gm)));
		}

		.gap-edge.last {
			top: anchor(var(--_ct) top);
			bottom: anchor(var(--_ct) bottom);
			left: min(anchor(var(--_a) right), calc(100% - var(--_gm)));
			right: max(
				0px,
				calc(anchor(var(--_a) right) - var(--_gm)),
				anchor(var(--_c) right)
			);
		}
	}

	/* --------------------------------------------------------------------- */
	/* Trailing gap (last offset in a row) — same as gap-row.last in old CSS */
	/* Uses --_a (adjacent = last node) for positioning.                     */
	/* --------------------------------------------------------------------- */

	@container style(--row: 1) {
		.gap-marker.gap-edge.last.pair {
			left: min(
				anchor(var(--_a) right),
				calc(
					anchor(var(--_a) right)
					+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
					- max(
						max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
						var(--_gm)
					) / 2
					+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
				),
				calc(100% - var(--_gm)),
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
				)
			);
			right: max(
				0px,
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
				),
				calc(
					anchor(var(--_a) right) - var(--_gm)
					- max(0px,
						(anchor(var(--_a) right) - anchor(var(--_c) right))
						- (max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)))
						+ 0.5px
					) * 9999
				),
				calc(
					anchor(var(--_a) right) - var(--_gm)
					- max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
				),
				min(
					anchor(var(--_c) right),
					calc(anchor(var(--_a) right) - var(--_eg))
				)
			);
		}
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

		/* Column layout marker (horizontal dashed line). */
		&:not(.gap-empty)::before {
			top: 50%;
			left: var(--node-cursor-marker-inset, 2px);
			right: var(--node-cursor-marker-inset, 2px);
			border-top: var(--node-cursor-line-border, 1px dashed var(--node-cursor-gap-color, var(--stroke-color)));
			transform: translateY(-0.5px);
			mask-image: linear-gradient(to right,
				black calc(50% - var(--gap-center)),
				transparent calc(50% - var(--gap-center)),
				transparent calc(50% + var(--gap-center)),
				black calc(50% + var(--gap-center)));
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

	/* Row layout marker override (vertical dashed line). */
	@container style(--row: 1) {
		.gap-marker:not(.active):not(.gap-empty)::before {
			top: var(--node-cursor-marker-inset, 2px);
			bottom: var(--node-cursor-marker-inset, 2px);
			left: 50%;
			right: auto;
			width: 0;
			border-top: none;
			border-left: var(--node-cursor-line-border, 1px dashed var(--node-cursor-gap-color, var(--stroke-color)));
			transform: translateX(-0.5px);
			mask-image: linear-gradient(to bottom,
				black calc(50% - var(--gap-center)),
				transparent calc(50% - var(--gap-center)),
				transparent calc(50% + var(--gap-center)),
				black calc(50% + var(--gap-center)));
		}
	}

	/* Debugging styles — REMOVE ONLY BEFORE MERGING THE PR */
	:global([data-type="node_array"]) {
		outline: 0.1px solid green;
	}
	.gap-marker {
		outline: 0.1px solid blue;
		outline-offset: -2px;
	}
</style>
