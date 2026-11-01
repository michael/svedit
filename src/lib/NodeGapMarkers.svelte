<script lang="ts">
	import { getContext } from 'svelte';
	import NodeCaret from './NodeCaret.svelte';
	import { PATH_SEPARATOR, serialize_path } from './utils.js';
	import type { DocumentPath, NodeArrayRenderContext, SveditRenderContext } from './types.js';

	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │ MUST RULES — do not violate when modifying this file            │
	 * ├─────────────────────────────────────────────────────────────────┤
	 * │ 1. Edge markers (gap-edge.first / gap-edge.last) MUST render    │
	 * │    OUTSIDE the node-array container — they extend into the     │
	 * │    whitespace above/below (column) or left/right (row) of the  │
	 * │    first/last node. They only clamp inward when the consumer   │
	 * │    explicitly opts in via --node-caret-boundary(-x/-y).        │
	 * │ 2. Markers MUST NEVER overlap nodes. They render strictly in   │
	 * │    the whitespace between nodes (mid markers) or outside the   │
	 * │    node array bounds (edge markers). Never on top of a node.  │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * Insertion gap markers of a single node_array, rendered for the gaps
	 * near the viewport. Lives inside NodeArrayProperty to inherit --row.
	 *
	 * The active marker (carrying the caret) also renders the consumer's
	 * `system_components.node_gap_tools` component, which inherits --row and
	 * shows/hides with the caret. The marker has pointer-events: none, so
	 * interactive tools must set pointer-events: auto themselves.
	 */
	let { path, count }: { path: DocumentPath; count: number } = $props();

	type GapMarker = {
		key: string;
		offset: number;
		type: string;
		vars: string;
		is_first: boolean;
		is_last: boolean;
		has_pair: boolean;
	};

	const svedit = getContext<SveditRenderContext>('svedit');
	// The node array this belongs to (rendered inside it)
	const node_array = getContext<NodeArrayRenderContext>('node_array_meta');
	let NodeGapTools = $derived(svedit.session.config.system_components?.node_gap_tools);
	let path_str = $derived(serialize_path(path));

	let caret_gap_key = $derived.by(() => {
		const selection = node_array.node_selection;
		if (!selection || selection.anchor_offset !== selection.focus_offset) return null;
		return `${path_str}-gap-${selection.anchor_offset}`;
	});

	let gaps = $derived.by((): GapMarker[] => {
		const anchor = (index: number) => `--${path_str}${PATH_SEPARATOR}${index}`;
		const container = `;--_c:--${path_str}`;
		const marker = (offset: number, type: string, vars: string): GapMarker => ({
			key: `${path_str}-gap-${offset}`,
			offset,
			type,
			vars: `${vars}${container}`,
			is_first: offset === 0,
			is_last: offset === count,
			has_pair: count >= 2
		});

		const near_indices = node_array.items.near_indices();
		if (count === 0) {
			return near_indices[0] === 0
				? [marker(0, 'gap-empty', `--_ct:--g-${path_str}${PATH_SEPARATOR}0-gap-before;--_a:${anchor(0)}`)]
				: [];
		}

		// Iterating the near indices (O(visible)) instead of 0..count
		const near = near_indices.filter((index) => index < count);
		if (near.length === 0) return [];

		const edge_state = node_array.items.edge;
		const pair = count >= 2 ? `;--_f:${anchor(0)};--_s:${anchor(1)}` : '';
		const edge = (offset: number, adjacent: number) => {
			const gap_anchor = offset === 0 ? `0-gap-before` : `${offset - 1}-gap-after`;
			return marker(offset, 'gap-edge', `--_ct:--g-${path_str}${PATH_SEPARATOR}${gap_anchor};--_a:${anchor(adjacent)}${pair}`);
		};

		const result: GapMarker[] = [];
		// Edge gaps also require the edge node to have reached the container edge
		if (near[0] === 0 && edge_state?.first === true) result.push(edge(0, 0));
		// Mid gaps between consecutive near nodes
		for (let index = 1; index < near.length; index++) {
			const offset = near[index];
			if (offset !== near[index - 1] + 1) continue;
			result.push(
				marker(
					offset,
					'gap-mid',
					`--_ct:--g-${path_str}${PATH_SEPARATOR}${offset - 1}-gap-after;--_p:${anchor(offset - 1)};--_n:${anchor(offset)}${pair}`
				)
			);
		}
		if (near.at(-1) === count - 1 && edge_state?.last === true) {
			result.push(edge(count, count - 1));
		}
		return result;
	});
</script>

{#each gaps as gap (gap.key)}
	<div
		class="gap-marker {gap.type}"
		class:active={gap.key === caret_gap_key}
		class:first={gap.is_first}
		class:last={gap.is_last}
		class:pair={gap.has_pair}
		style={`${gap.vars};anchor-name:--gm-${gap.key}`}
		data-gap-array-path={path_str}
		data-gap-offset={gap.offset}
		contenteditable="false"
	>
		{#if gap.key === caret_gap_key}
			<NodeCaret />
			{#if NodeGapTools}
				<NodeGapTools {path} offset={gap.offset} is_first={gap.is_first} is_last={gap.is_last} />
			{/if}
		{/if}
	</div>
{/each}

<style>
	/*
	 * Public customization tokens (set on an ancestor or this component):
	 * --editing-stroke
	 * --node-caret-gap-color
	 * --node-caret-symbol-size
	 * --node-caret-symbol-stroke
	 * --node-caret-symbol-gap
	 * --node-caret-symbol-bg
	 * --node-caret-symbol-mask
	 * --node-caret-marker-inset
	 * --node-caret-edge-gap
	 * --node-caret-gap-min-size
	 * --node-caret-marker-padding
	 * --node-caret-marker-z-index
	 * --node-caret-line-border
	 * --node-caret-empty-border
	 * --node-caret-empty-border-radius
	 * --node-caret-bg
	 * --node-caret-shadow
	 * --node-caret-border
	 * --node-caret-thickness
	 * --node-caret-inset
	 * --node-caret-radius
	 * --node-caret-z-index
	 * --node-caret-blink-duration
	 * --node-caret-animation
	 * --node-caret-row-inline-position
	 * --node-caret-boundary          (anchor-name of a parent element; edge
	 *                                  gaps clamp to its edges instead of 0px.
	 *                                  Prevents overlap when the node array has
	 *                                  neighbors. See NodeGap.svelte for details.)
	 * --node-caret-boundary-x        (per-axis override; clamps left/right only)
	 * --node-caret-boundary-y        (per-axis override; clamps top/bottom only)
	 *
	 * Row/column detection uses var(--row, 1) with the * 9999999 multiplier
	 * trick throughout. Shorthand:
	 *   --_R: var(--row, 1)              (1 when row, 0 when column)
	 *   --_C: calc(1 - var(--row, 1))    (1 when column, 0 when row)
	 *
	 * Inside min(): + var(--_X) * 9999999px makes a branch huge → min ignores it.
	 * Inside max(): + var(--_X) * -9999999px makes a branch tiny → max ignores it.
	 * Nested min/max inherit the outermost convention: if the root is min(),
	 * all branches (even inside inner max()) use + 9999999px to disable.
	 */

	/* Suppress caret blink during active click on a node gap. */
	:global(.svedit-canvas:active) .gap-marker {
		--node-caret-animation: none;
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
		--_eg: var(--node-caret-edge-gap, 24px);
		--_gm: var(--node-caret-gap-min-size, 16px);
		--_R: var(--row, 1);
		--_C: calc(1 - var(--row, 1));
		position: absolute;
		position-visibility: anchors-visible;
		pointer-events: none;
		z-index: var(--node-caret-marker-z-index, 2);
		padding: var(--node-caret-marker-padding, 2px);
		margin: 0 !important; /* prevent unwanted margin from parent elements */
	}

	/*
	 * position-anchor ties the marker's containing-block/scroll behavior to
	 * a specific anchor element, so the marker tracks its anchor's scroll
	 * container the same way NodeGap's .svedit-selectable does. Without it,
	 * markers inside a nested scroll container stay fixed in viewport space
	 * while the anchored nodes scroll away.
	 */
	.gap-marker.gap-empty,
	.gap-marker.gap-edge {
		position-anchor: var(--_a);
	}
	.gap-marker.gap-mid {
		position-anchor: var(--_p);
	}

	/* --------------------------------------------------------------------- */
	/* Empty array                                                           */
	/* --------------------------------------------------------------------- */

	.gap-marker.gap-empty {
		--node-caret-row-inline-position: calc(var(--_R) * 0px + var(--_C) * 50%);
		top: anchor(var(--_a) top);
		left: anchor(var(--_a) left);
		bottom: anchor(var(--_a) bottom);
		right: max(
			calc(anchor(var(--_a) right) + var(--_R) * -9999999px),
			calc(anchor(var(--_a) right) + var(--_C) * -9999999px),
			calc(anchor(var(--_a) left) - var(--_eg) + var(--_C) * -9999999px)
		);
	}

	/* --------------------------------------------------------------------- */
	/* Mid gap (between two nodes) — anchors directly to --_p and --_n.     */
	/* Column: spans from prev bottom to next top, with a centering branch  */
	/* that guarantees at least --_gm height when the gap is too small.     */
	/* Row: spans prev node. Row left/right use complex narrowing logic;    */
	/* row branches all get + var(--_C) * 9999999px so they're ignored in     */
	/* column layout.                                                        */
	/* --------------------------------------------------------------------- */

	.gap-marker.gap-mid {
		top: min(
			calc(anchor(var(--_p) bottom) + var(--_R) * 9999999px),
			calc(
				(anchor(var(--_p) bottom) + anchor(var(--_n) top)) / 2
				- var(--_gm) / 2
				+ var(--_R) * 9999999px
			),
			calc(anchor(var(--_p) top) + var(--_C) * 9999999px)
		);
		bottom: min(
			calc(anchor(var(--_n) top) + var(--_R) * 9999999px),
			calc(
				(anchor(var(--_p) bottom) + anchor(var(--_n) top)) / 2
				- var(--_gm) / 2
				+ var(--_R) * 9999999px
			),
			calc(anchor(var(--_p) bottom) + var(--_C) * 9999999px)
		);
		left: min(
			calc(anchor(var(--_p) left) + var(--_R) * 9999999px),
			calc(anchor(var(--_p) right) + var(--_C) * 9999999px),
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--_gm) / 2
				+ max(0px, anchor(var(--_p) right) - anchor(var(--_n) left)) * 9999
				+ var(--_C) * 9999999px
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
				+ var(--_C) * 9999999px
			),
			/* Safety clamp for wrap: pins marker inside CB when prev/next wrap
			   across rows (so the marker ends at the right edge of row 1).
			   Disabled in nowrap/horizontal-scroll where p and n are
			   side-by-side on the same row — there the other branches
			   position correctly and this clamp would wrongly force the
			   marker to the CB right. */
			calc(
				100% - var(--_gm)
				+ max(0px, anchor(var(--_n) left) - anchor(var(--_p) right) + 0.5px) * 9999
				+ var(--_C) * 9999999px
			),
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
				+ var(--_C) * 9999999px
			)
		);
		right: max(
			/* CB-right floor, disabled in nowrap/horizontal-scroll where n
			   extends past CB right (p_right - n_left > 0 in right context,
			   equivalent to n_left_body > p_right_body in layout). In that
			   case the marker must extend past CB right to reach the gap,
			   so right must be allowed to go negative. */
			calc(
				0px + var(--_C) * -9999999px
				- max(0px, anchor(var(--_p) right) - anchor(var(--_n) left) + 0.5px) * 9999
			),
			min(
				calc(anchor(var(--_p) right) + var(--_R) * 9999999px),
				calc(
					anchor(var(--_n) left) + var(--_C) * 9999999px
				),
				calc(
					(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
					- var(--_gm) / 2
					+ var(--_C) * 9999999px
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
						+ var(--_C) * 9999999px
					),
					calc(
						anchor(var(--_p) right) - var(--_gm)
						- max(0px,
							(anchor(var(--_p) right) - anchor(var(--_c) right))
							- (max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)))
							+ 0.5px
						) * 9999
						+ var(--_C) * 9999999px
					),
					calc(
						anchor(var(--_p) right) - var(--_gm)
						- max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
						+ var(--_C) * 9999999px
					),
					calc(
						anchor(var(--_p) right)
						- (anchor(var(--_n) left) - anchor(var(--_p) right)) * 9999
						+ var(--_C) * 9999999px
					),
					min(
						calc(anchor(var(--_c) right) + var(--_C) * 9999999px),
						calc(anchor(var(--_p) right) - var(--_eg) + var(--_C) * 9999999px)
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
		--_b-t: anchor(var(--node-caret-boundary-y, var(--node-caret-boundary, --_no-boundary)) top, 0px);
		--_b-l: anchor(var(--node-caret-boundary-x, var(--node-caret-boundary, --_no-boundary)) left, 0px);
		top: min(
			calc(anchor(var(--_a) top) + var(--_C) * 9999999px),
			calc(max(var(--_b-t), calc(anchor(var(--_a) top) - var(--_gm))) + var(--_R) * 9999999px)
		);
		bottom: min(
			calc(anchor(var(--_a) bottom) + var(--_C) * 9999999px),
			calc(anchor(var(--_a) top) + var(--_R) * 9999999px)
		);
		left: min(
			calc(anchor(var(--_a) left) + var(--_R) * 9999999px),
			calc(max(var(--_b-l), calc(anchor(var(--_a) left) - var(--_gm))) + var(--_C) * 9999999px)
		);
		right: min(
			calc(anchor(var(--_a) right) + var(--_R) * 9999999px),
			calc(anchor(var(--_a) left) + var(--_C) * 9999999px)
		);
	}

	/* Edge last: column = below last node, row = right of last node.
	   top/left also clamp to boundary - gm so that min-height/min-width
	   (which win over bottom/right in overconstrained abs-pos) cannot
	   push the element past the boundary. */
	.gap-edge.last {
		--_b-b: anchor(var(--node-caret-boundary-y, var(--node-caret-boundary, --_no-boundary)) bottom, 0px);
		--_b-r: anchor(var(--node-caret-boundary-x, var(--node-caret-boundary, --_no-boundary)) right, 0px);
		--_b-bt: anchor(var(--node-caret-boundary-y, var(--node-caret-boundary, --_no-boundary)) bottom, 9999999px);
		--_b-rl: anchor(var(--node-caret-boundary-x, var(--node-caret-boundary, --_no-boundary)) right, 9999999px);
		top: min(
			calc(anchor(var(--_a) top) + var(--_C) * 9999999px),
			calc(
				min(
					anchor(var(--_a) bottom),
					calc(var(--_b-bt) - var(--_gm))
				) + var(--_R) * 9999999px
			)
		);
		bottom: min(
			calc(anchor(var(--_a) bottom) + var(--_C) * 9999999px),
			calc(max(var(--_b-b), calc(anchor(var(--_a) bottom) - var(--_gm))) + var(--_R) * 9999999px)
		);
		left: min(
			calc(anchor(var(--_a) left) + var(--_R) * 9999999px),
			calc(
				min(
					anchor(var(--_a) right),
					calc(var(--_b-rl) - var(--_gm))
				) + var(--_C) * 9999999px
			),
			calc(100% - var(--_gm) + var(--_C) * 9999999px)
		);
		right: max(
			calc(var(--_b-r) + var(--_C) * -9999999px),
			calc(anchor(var(--_a) right) + var(--_R) * -9999999px),
			calc(anchor(var(--_a) right) - var(--_gm) + var(--_C) * -9999999px),
			/* Column / wrap-layout fill: when the last item sits within
			   the container (non-overflow), max picks anchor(--_c right)
			   and the marker stretches to the containers trailing edge.
			   In row-overflow this branch is dominated by anchor(--_a right)
			   which is smaller, so the marker follows the trailing node
			   past the container. */
			calc(anchor(var(--_c) right) + var(--_C) * -9999999px)
		);
	}

	/* --------------------------------------------------------------------- */
	/* Trailing gap in row with 2+ items: complex narrowing using --_f/--_s  */
	/* Overrides .gap-edge.last — must re-include col branch for both left   */
	/* (min: + 9999999px to disable) and right (max: * -9999999px to disable).   */
	/* --------------------------------------------------------------------- */

	/* Purpose of this + 0.5px: disable for zero-gap grids (see .gap-mid comment). */
	.gap-marker.gap-edge.last.pair {
		left: min(
			calc(anchor(var(--_a) left) + var(--_R) * 9999999px),
			calc(anchor(var(--_a) right) + var(--_C) * 9999999px),
			calc(var(--_b-rl) - var(--_gm) + var(--_C) * 9999999px),
			calc(
				anchor(var(--_a) right)
				+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
				- max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--_gm)
				) / 2
				+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
				+ max(0px, anchor(var(--_a) right) - anchor(var(--_c) right) + 0.5px) * 9999
				+ var(--_C) * 9999999px
			),
			/* Safety clamp for wrap: pins marker inside CB when items 0 and 1
			   wrap across rows. Disabled in nowrap/horizontal-scroll where
			   items 0 and 1 are side-by-side on the same row — there the
			   anchor-based branches position correctly and this clamp would
			   wrongly force the marker to the CB right. */
			calc(
				100% - var(--_gm)
				+ max(0px, anchor(var(--_s) left) - anchor(var(--_f) right) + 0.5px) * 9999
				+ var(--_C) * 9999999px
			),
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
				+ var(--_C) * 9999999px
			)
		);
		right: max(
			calc(anchor(var(--_a) right) + var(--_R) * -9999999px),
			calc(var(--_b-r) + var(--_C) * -9999999px),
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
				+ var(--_C) * -9999999px
			),
			calc(
				anchor(var(--_a) right) - var(--_gm)
				- max(0px,
					(anchor(var(--_a) right) - anchor(var(--_c) right))
					- (max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)))
					+ 0.5px
				) * 9999
				+ var(--_C) * -9999999px
			),
			calc(
				anchor(var(--_a) right) - var(--_gm)
				- max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
				+ var(--_C) * -9999999px
			),
			min(
				calc(anchor(var(--_c) right) + var(--_C) * -9999999px),
				calc(anchor(var(--_a) right) - var(--_eg) + var(--_C) * -9999999px)
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
			--gap-center: calc( var(--node-caret-symbol-size, 6px) / 2 + var(--node-caret-symbol-gap, 4px) );
		}

		/* Dashed line: horizontal (column) or vertical (row).
		   Column: top=50% bottom=50% → zero height, border-top is the line.
		   Row: left=50% right=50% → zero width, border-left is the line.
		   No explicit height/width — inset pairs control dimensions. */
		&:not(.gap-empty)::before {
			--_mi: var(--node-caret-marker-inset, 2px);
			top: min(
				calc(50% + var(--_R) * 9999999px),
				calc(var(--_mi) + var(--_C) * 9999999px)
			);
			bottom: min(
				calc(50% + var(--_R) * 9999999px),
				calc(var(--_mi) + var(--_C) * 9999999px)
			);
			left: min(
				calc(var(--_mi) + var(--_R) * 9999999px),
				calc(50% + var(--_C) * 9999999px)
			);
			right: min(
				calc(var(--_mi) + var(--_R) * 9999999px),
				calc(50% + var(--_C) * 9999999px)
			);
			border-top: calc(var(--_C) * 1px) dashed var(--node-caret-gap-color, var(--editing-stroke));
			border-left: calc(var(--_R) * 1px) dashed var(--node-caret-gap-color, var(--editing-stroke));
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
			border: var(--node-caret-empty-border, 1px dashed var(--node-caret-gap-color, var(--editing-stroke)));
			border-radius: var(--node-caret-empty-border-radius, 3px);
		}

		/* Centered insertion symbol (default mask renders a plus). */
		&::after {
			content: '';
			position: absolute;
			width: var(--node-caret-symbol-size, 6px);
			height: var(--node-caret-symbol-size, 6px);
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background: var(--node-caret-symbol-bg, var(--node-caret-gap-color, var(--editing-stroke)));
			mask: var(--node-caret-symbol-mask,
				linear-gradient(black, black) center / 100% var(--node-caret-symbol-stroke, 1px) no-repeat,
				linear-gradient(black, black) center / var(--node-caret-symbol-stroke, 1px) 100% no-repeat
			);
		}
	}

	/* Debugging styles - DO NOT CHANGE OR REMOVE */
	/* :global([data-type="node_array"]) {
		outline: 0.1px solid green;
	}
	.gap-marker {
		outline: 1px solid blue;
		outline-offset: 0.5px;
	} */
</style>
