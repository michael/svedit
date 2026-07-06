<script module>
	function cycle_z_index(/** @type {MouseEvent} */ e) {
		const el = /** @type {HTMLElement} */ (e.currentTarget);
		if (el.hasAttribute('data-sent-to-back')) {
			document.querySelectorAll('.svedit-selectable[data-sent-to-back]').forEach((prev) => {
				prev.removeAttribute('data-sent-to-back');
			});
		}
		el.setAttribute('data-sent-to-back', '');
	}
</script>

<script>
	import { serialize_path } from './utils.js';
	import { getContext } from 'svelte';
	import { should_position_gap } from './node_visibility.svelte.js';

	/**
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │ MUST RULES — do not violate when modifying this file            │
	 * ├─────────────────────────────────────────────────────────────────┤
	 * │ 1. Edge gaps (gap-before at offset 0 / gap-after.last) MUST      │
	 * │    render OUTSIDE the node-array container — they extend into   │
	 * │    the whitespace above/below (column) or left/right (row) of   │
	 * │    the first/last node. They only clamp when the consumer       │
	 * │    explicitly opts in via --node-caret-boundary(-x/-y).         │
	 * │ 2. Gaps MUST NEVER overlap nodes. They render strictly in the   │
	 * │    whitespace between nodes (mid gaps) or outside the node      │
	 * │    array bounds (edge gaps). Never on top of a node.            │
	 * └─────────────────────────────────────────────────────────────────┘
	 *
	 * Invisible keyboard caret selectable and gap hit area.
	 *
	 * Rendered as a sibling of Node elements inside NodeArrayProperty,
	 * interleaved between nodes in DOM order. This ensures:
	 * - Correct DOM order for native drag-to-select across nodes
	 * - No containing-block issues from transform/filter/will-change on nodes
	 *
	 * Always present in the DOM when editable (stable structure for
	 * selection anchoring, scrollTo, etc.). Anchor positioning is
	 * activated lazily via the `.positioned` class, derived reactively
	 * from the visibility registry's array_indices / edge_map. Svelte's
	 * reactive collections track reads at per-key granularity, so a
	 * registry write only
	 * re-evaluates the adjacent gaps. Applying the class declaratively
	 * (instead of imperative classList toggles) means it survives DOM
	 * recreation without a document change (e.g. dev-mode HMR).
	 *
	 * `position-visibility: anchors-visible` does NOT skip anchor
	 * resolution — the browser resolves all anchor() then hides the
	 * result. The `.positioned` class toggle is required to prevent
	 * O(N) anchor resolution on every layout pass.
	 *
	 * Row/column detection uses var(--row, 1) with the * 99999 multiplier
	 * trick — no @container style() queries, works in all browsers.
	 *
	 * If you override this component via `system_components.node_gap`, make
	 * sure your custom component also handles read-only mode by rendering a
	 * plain `.node-gap` placeholder without editable internals.
	 */
	const svedit = getContext('svedit');
	let { array_path, offset, count, empty = false } = $props();
	let is_editable = $derived(svedit.editable);

	let is_first = $derived(offset === 0);
	let is_last = $derived(offset === count);
	let type = $derived(is_first ? 'gap-before' : 'gap-after');

	let path_str = $derived(serialize_path(array_path));
	// Two-derived split is load-bearing: get_array_indices lazily
	// creates the set, and Svelte doesn't track deps on state created
	// inside the reading derived — so acquire here, read in `positioned`.
	let near_indices = $derived(svedit.visibility_registry.get_array_indices(path_str));
	let positioned = $derived(
		is_editable &&
			should_position_gap(
				near_indices,
				svedit.visibility_registry.edge_map.get(path_str),
				offset,
				is_last,
				empty
			)
	);

	let gap_style = $derived.by(() => {
		if (!is_editable) return '';
		const prev_idx = offset - 1;
		const pa = is_first
			? `--${serialize_path([...array_path, 0])}`
			: `--${serialize_path([...array_path, prev_idx])}`;
		const next = `--${serialize_path([...array_path, offset])}`;
		const container = `--${serialize_path(array_path)}`;
		return `--_pa:${pa};--_next:${next};--_container:${container}`;
	});

	let anchor_name = $derived.by(() => {
		if (!is_editable) return '';
		if (is_first) return `--g-${serialize_path([...array_path, 0])}-gap-before`;
		return `--g-${serialize_path([...array_path, offset - 1])}-gap-after`;
	});
</script>

{#if is_editable}
	<div
		class="node-gap"
		class:gap-before={is_first}
		class:gap-after={!is_first}
		class:empty
		class:last={is_last}
		class:positioned
		data-type={type}
		data-gap-array-path={path_str}
		data-gap-offset={offset}
		style={gap_style}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="svedit-selectable" style="anchor-name:{anchor_name}" onpointerdown={cycle_z_index}>
			<br />
		</div>
	</div>
{:else}
	<div class="node-gap"></div>
{/if}

<style>
	.node-gap {
		display: contents;
		/* The native browser caret briefly appears inside .svedit-selectable for one frame 
		before the model-driven NodeCaret renders at the correct edge position. 
		Suppressing it here avoids a flash of the native caret. */
		caret-color: transparent;
	}

	/* ------------------------------------------------------------------ */
	/* Un-positioned: minimal in-DOM presence, no anchor resolution        */
	/* ------------------------------------------------------------------ */

	:global(.node-gap:not(.positioned) .svedit-selectable) {
		position: absolute;
		pointer-events: none;
		width: 0;
		height: 0;
		overflow: clip;
	}

	/* ------------------------------------------------------------------ */
	/* Positioned: full anchor layout                                      */
	/* ------------------------------------------------------------------ */

	/*
	 * Anchor references resolved from CSS variable names passed via
	 * inline style (--_pa = parent anchor, --_next, --_container).
	 * Same pattern as NodeGapMarkers — keeps JS minimal and anchor() in CSS.
	 *
	 * --_pa references the anchor-name of the node this gap belongs to,
	 * allowing us to position relative to that node's edges.
	 *
	 * Edge gaps extend outward and clamp to the containing block edge
	 * (0px floor). This can overlap neighboring elements when the node
	 * array isn't alone in its parent. anchor() only sees the border
	 * box, so it can't detect margin, gap, or parent padding around
	 * the container. --node-caret-boundary lets consumers set an
	 * explicit clamp target (a parent element's anchor-name) so edge
	 * gaps stop at that boundary instead. --node-caret-boundary-x and
	 * --node-caret-boundary-y override per-axis, falling back to
	 * --node-caret-boundary when unset.
	 */
	:global(.node-gap.positioned) {
		/* Fallback 9999999px: when --_pa is orphan (node briefly missing during
		   edits), anchor() without a fallback invalidates the custom property
		   and `top` falls back to 0, placing the gap at viewport top as a
		   giant overlay. 9999999px ensures orphan anchors produce huge values
		   that min() excludes instead.
		   LIMIT: documents taller or wider than 9999999px will re-surface
		   the reported giant-overlay bug — the fallback must exceed the
		   containing block's dimensions to land off-screen. If you need to
		   support larger documents, bump this value here and in the matching
		   `* 9999999px` branch-disable trick throughout this file (and in
		   NodeGapMarkers.svelte). Stay below ~33M px to avoid Blink's
		   LayoutUnit ceiling. */
		--_s-t: anchor(var(--_pa) top, 9999999px);
		--_s-b: anchor(var(--_pa) bottom, 9999999px);
		--_s-l: anchor(var(--_pa) left, 9999999px);
		--_s-r: anchor(var(--_pa) right, 9999999px);
	}
	:global(.node-gap.positioned.gap-before:not(.empty)) {
		--_b-t: anchor(
			var(--node-caret-boundary-y, var(--node-caret-boundary, --_no-boundary)) top,
			0px
		);
		--_b-l: anchor(
			var(--node-caret-boundary-x, var(--node-caret-boundary, --_no-boundary)) left,
			0px
		);
	}
	:global(.node-gap.positioned.gap-after:not(.last)) {
		--_n-t: anchor(var(--_next) top);
		--_n-l: anchor(var(--_next) left);
		--_c-r: anchor(var(--_container) right);
	}
	:global(.node-gap.positioned.gap-after.last),
	:global(.node-gap.positioned.gap-before.empty) {
		--_c-t: anchor(var(--_container) top);
		--_c-b: anchor(var(--_container) bottom);
		--_c-l: anchor(var(--_container) left);
		--_c-r: anchor(var(--_container) right);
		--_b-b: anchor(
			var(--node-caret-boundary-y, var(--node-caret-boundary, --_no-boundary)) bottom,
			0px
		);
		--_b-r: anchor(
			var(--node-caret-boundary-x, var(--node-caret-boundary, --_no-boundary)) right,
			0px
		);
		--_b-bt: anchor(
			var(--node-caret-boundary-y, var(--node-caret-boundary, --_no-boundary)) bottom,
			9999999px
		);
		--_b-rl: anchor(
			var(--node-caret-boundary-x, var(--node-caret-boundary, --_no-boundary)) right,
			9999999px
		);
	}

	:global(.node-gap.positioned .svedit-selectable) {
		--_eg: var(--node-caret-edge-gap, 24px);
		--_gm: var(--node-caret-gap-min-size, 16px);
		--_R: var(--row, 1);
		--_C: calc(1 - var(--row, 1));
		user-select: none;
		pointer-events: auto;
		position: absolute;
		position-anchor: var(--_pa);
		position-visibility: anchors-visible;
		z-index: var(--node-caret-gap-z-index, 1);
		cursor: pointer;
	}

	:global(.node-gap.positioned .svedit-selectable[data-sent-to-back]) {
		z-index: 0;
	}

	/* ------------------------------------------------------------------ */
	/* Merged column / row layout positioning                              */
	/*                                                                    */
	/* Uses var(--row, 1) with the * 99999 multiplier trick:              */
	/*   --_R = var(--row, 1)          → 1 in row, 0 in column           */
	/*   --_C = calc(1 - var(--row, 1))→ 1 in column, 0 in row           */
	/* Inside min(), + var(--_R) * 9999999px disables a col branch in row,  */
	/* + var(--_C) * 9999999px disables a row branch in column.             */
	/* ------------------------------------------------------------------ */

	/* Between two siblings: col centers vertically, row centers horizontally */
	:global(.node-gap.positioned.gap-after:not(.last) .svedit-selectable) {
		--_mid: calc((var(--_s-b) + var(--_n-t)) / 2 - var(--_gm) / 2);
		top: min(
			calc(var(--_s-b) + var(--_R) * 9999999px),
			calc(var(--_mid) + var(--_R) * 9999999px),
			calc(var(--_s-t) + var(--_C) * 9999999px)
		);
		bottom: min(
			calc(var(--_n-t) + var(--_R) * 9999999px),
			calc(var(--_mid) + var(--_R) * 9999999px),
			calc(var(--_s-b) + var(--_C) * 9999999px)
		);
		left: min(
			calc(var(--_s-l) + var(--_R) * 9999999px),
			calc(var(--_s-r) + var(--_C) * 9999999px),
			calc(
				(var(--_s-r) + var(--_n-l)) / 2 - var(--_gm) / 2 + max(0px, var(--_s-r) - var(--_n-l)) *
					999 + var(--_C) * 9999999px
			),
			/* Safety clamp for wrap: pins gap inside CB when current/next
			   wrap across rows. Disabled in nowrap/horizontal-scroll where
			   next is side-by-side on the same row (n-l > s-r) — there
			   the other branches position correctly and this clamp would
			   wrongly force the gap to CB right minus eg. */
			calc(
					100% - var(--_eg) + max(0px, var(--_n-l) - var(--_s-r) + 0.5px) * 9999 + var(--_C) *
						9999999px
				)
		);
		right: min(
			calc(var(--_s-r) + var(--_R) * 9999999px),
			calc(
				max(
						0px,
						min(
							var(--_n-l),
							calc((var(--_s-r) + var(--_n-l)) / 2 - var(--_gm) / 2),
							max(
								min(calc(var(--_c-r) - var(--_eg)), calc(var(--_s-r) - var(--_eg))),
								calc(var(--_s-r) - (var(--_n-l) - var(--_s-r)) * 999)
							)
						)
					) +
					var(--_C) * 9999999px
			)
		);
		min-height: calc(var(--_gm) * var(--_C));
		min-width: calc(var(--_gm) * var(--_R));
		/* min-height: max(calc(var(--_gm) * var(--_C)), calc(anchor-size(var(--_pa) height, 100%) * var(--_R)));
		min-width: max(calc(var(--_gm) * var(--_R)), calc(anchor-size(var(--_pa) width, 100%) * var(--_C))); */
	}

	/* After last node: col extends down, row extends right.
	   top also clamps to boundary_bottom - eg so that min-height
	   (which wins over bottom in overconstrained abs-pos) cannot
	   push the element past the boundary.

	   left's third branch (100% - --_eg + max(0, --_s-r - 100% + 0.5px) * 9999)
	   is the wrap-layout safety clamp: in column or row+wrap layouts
	   where the last node sits WITHIN the CB (--_s-r < 100%), it pins
	   the gap inside the CB so it doesn't extend past the right edge.
	   The * 9999 multiplier disables this branch in nowrap horizontal-
	   scroll (where --_s-r > 100% — the trailing node has overflowed
	   the CB and the gap is expected to follow it).

	   right's `min(--_c-r - --_eg, --_s-r - --_eg)` is what fills the
	   gap into the whitespace between the last node and the container
	   in non-overflow layouts. In non-overflow, --_c-r < --_s-r in the
	   `right` axis (container right is further left than node right
	   from the CB right edge), so min picks --_c-r - --_eg and the gap
	   ends at container.right + --_eg (the MUST-RULE overshoot). In
	   overflow, --_s-r < --_c-r and min picks --_s-r - --_eg — the gap
	   follows the node out past the container. */
	:global(.node-gap.positioned.gap-after.last .svedit-selectable) {
		top: min(
			calc(min(var(--_s-b), calc(var(--_b-bt) - var(--_eg))) + var(--_R) * 9999999px),
			calc(var(--_s-t) + var(--_C) * 9999999px)
		);
		bottom: min(
			calc(max(var(--_b-b), var(--_s-b) - var(--_eg)) + var(--_R) * 9999999px),
			calc(var(--_s-b) + var(--_C) * 9999999px)
		);
		left: min(
			calc(var(--_s-l) + var(--_R) * 9999999px),
			calc(min(var(--_s-r), calc(var(--_b-rl) - var(--_eg))) + var(--_C) * 9999999px),
			calc(100% - var(--_eg) + max(0px, var(--_s-r) - 100% + 0.5px) * 9999 + var(--_C) * 9999999px)
		);
		right: min(
			calc(var(--_s-r) + var(--_R) * 9999999px),
			calc(
				max(var(--_b-r), min(calc(var(--_c-r) - var(--_eg)), calc(var(--_s-r) - var(--_eg)))) +
					var(--_C) * 9999999px
			)
		);
		min-height: calc(var(--_eg) * var(--_C));
		min-width: calc(var(--_eg) * var(--_R));
	}

	/* Before first node: col extends up, row extends left */
	:global(.node-gap.positioned.gap-before:not(.empty) .svedit-selectable) {
		top: min(
			calc(max(var(--_b-t), var(--_s-t) - var(--_eg)) + var(--_R) * 9999999px),
			calc(var(--_s-t) + var(--_C) * 9999999px)
		);
		bottom: min(
			calc(var(--_s-t) + var(--_R) * 9999999px),
			calc(var(--_s-b) + var(--_C) * 9999999px)
		);
		left: min(
			calc(var(--_s-l) + var(--_R) * 9999999px),
			calc(max(var(--_b-l), var(--_s-l) - var(--_eg)) + var(--_C) * 9999999px)
		);
		right: min(
			calc(var(--_s-r) + var(--_R) * 9999999px),
			calc(var(--_s-l) + var(--_C) * 9999999px)
		);
		min-height: calc(var(--_eg) * var(--_C));
		min-width: calc(var(--_eg) * var(--_R));
	}

	/* Empty array: the gap fills its placeholder, which is this
	   selectable's containing block (NodeArrayProperty sets it
	   position: relative). inset:0 fills it with no anchor() — so no
	   .positioned gating and no anchor cost. The width:auto, height:auto
	   and pointer-events:auto override the :not(.positioned) 0×0
	   collapse; position-visibility:always overrides the .positioned
	   rule's anchors-visible, so a transient positioned toggle can't
	   hide the gap. */
	:global(.node-gap.gap-before.empty .svedit-selectable) {
		position: absolute;
		inset: 0;
		width: auto;
		height: auto;
		pointer-events: auto;
		position-visibility: always;
	}

	/* Debugging styles - DO NOT CHANGE OR REMOVE */
	/* :global(.node-gap.positioned .svedit-selectable) {
		outline: 2px solid rgba(238, 0, 255, 0.5);
		background-color: rgba(238, 0, 255, 0.5);
		outline-offset: -0.5px;
	} */
</style>
