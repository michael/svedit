<script>
	/**
	 * Invisible keyboard caret selectable and gap hit area.
	 *
	 * Rendered as a sibling of Node elements inside NodeArrayProperty,
	 * interleaved between nodes in DOM order. This ensures:
	 * - Correct DOM order for native drag-to-select across nodes
	 * - No containing-block issues from transform/filter/will-change on nodes
	 *
	 * Always present in the DOM when editable (stable structure for
	 * selection anchoring, scrollTo, etc.). Anchor positioning is
	 * activated lazily via the `positioned` prop — only gaps near the
	 * viewport pay the layout cost of anchor() resolution. Off-screen
	 * gaps are zero-size static elements with no layout cost.
	 *
	 * `position-visibility: anchors-visible` does NOT skip anchor
	 * resolution — the browser resolves all anchor() then hides the
	 * result. The `.positioned` class toggle is required to prevent
	 * O(N) anchor resolution on every layout pass.
	 *
	 * Row/column detection uses var(--row, 1) with the * 99999 multiplier
	 * trick — no @container style() queries, works in all browsers.
	 */
	let { array_path, offset, count, empty = false, positioned = true } = $props();

	let is_first = $derived(offset === 0);
	let is_last = $derived(offset === count);
	let type = $derived(is_first ? 'gap-before' : 'gap-after');

	let gap_style = $derived.by(() => {
		const arr = array_path.join('-');
		const prev_idx = offset - 1;
		const pa = is_first ? `--${arr}-0` : `--${arr}-${prev_idx}`;
		const next = `--${arr}-${offset}`;
		const container = `--${arr}`;
		return `--_pa:${pa};--_next:${next};--_container:${container}`;
	});

	let anchor_name = $derived.by(() => {
		const arr = array_path.join('-');
		if (is_first) return `--g-${arr}-0-gap-before`;
		return `--g-${arr}-${offset - 1}-gap-after`;
	});
</script>

<div
	class="node-gap {type}"
	class:empty
	class:last={is_last}
	class:positioned
	data-type={type}
	data-gap-array-path={array_path.join('.')}
	data-gap-offset={offset}
	style={gap_style}
>
	<div class="svedit-selectable" style="anchor-name:{anchor_name}"><br /></div>
</div>


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

	.node-gap:not(.positioned) .svedit-selectable {
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
	.node-gap.positioned {
		--_s-t: anchor(var(--_pa) top);
		--_s-b: anchor(var(--_pa) bottom);
		--_s-l: anchor(var(--_pa) left);
		--_s-r: anchor(var(--_pa) right);
	}
	.positioned.gap-before:not(.empty) {
		--_b-t: anchor(var(--node-caret-boundary-y, var(--node-caret-boundary, --_no-boundary)) top, 0px);
		--_b-l: anchor(var(--node-caret-boundary-x, var(--node-caret-boundary, --_no-boundary)) left, 0px);
	}
	.positioned.gap-after:not(.last) {
		--_n-t: anchor(var(--_next) top);
		--_n-l: anchor(var(--_next) left);
		--_c-r: anchor(var(--_container) right);
	}
	.positioned.gap-after.last,
	.positioned.gap-before.empty {
		--_c-t: anchor(var(--_container) top);
		--_c-b: anchor(var(--_container) bottom);
		--_c-l: anchor(var(--_container) left);
		--_c-r: anchor(var(--_container) right);
		--_b-b: anchor(var(--node-caret-boundary-y, var(--node-caret-boundary, --_no-boundary)) bottom, 0px);
		--_b-r: anchor(var(--node-caret-boundary-x, var(--node-caret-boundary, --_no-boundary)) right, 0px);
		--_b-bt: anchor(var(--node-caret-boundary-y, var(--node-caret-boundary, --_no-boundary)) bottom, 99999px);
		--_b-rl: anchor(var(--node-caret-boundary-x, var(--node-caret-boundary, --_no-boundary)) right, 99999px);
	}

	.positioned .svedit-selectable {
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

	/* ------------------------------------------------------------------ */
	/* Merged column / row layout positioning                              */
	/*                                                                    */
	/* Uses var(--row, 1) with the * 99999 multiplier trick:              */
	/*   --_R = var(--row, 1)          → 1 in row, 0 in column           */
	/*   --_C = calc(1 - var(--row, 1))→ 1 in column, 0 in row           */
	/* Inside min(), + var(--_R) * 99999px disables a col branch in row,  */
	/* + var(--_C) * 99999px disables a row branch in column.             */
	/* ------------------------------------------------------------------ */

	/* Between two siblings: col centers vertically, row centers horizontally */
	.positioned.gap-after:not(.last) .svedit-selectable {
		--_mid: calc((var(--_s-b) + var(--_n-t)) / 2 - var(--_gm) / 2);
		top: min(
			calc(var(--_s-b) + var(--_R) * 99999px),
			calc(var(--_mid) + var(--_R) * 99999px),
			calc(var(--_s-t) + var(--_C) * 99999px)
		);
		bottom: min(
			calc(var(--_n-t) + var(--_R) * 99999px),
			calc(var(--_mid) + var(--_R) * 99999px),
			calc(var(--_s-b) + var(--_C) * 99999px)
		);
		left: min(
			calc(var(--_s-l) + var(--_R) * 99999px),
			calc(var(--_s-r) + var(--_C) * 99999px),
			calc(
				(var(--_s-r) + var(--_n-l)) / 2
				- var(--_gm) / 2
				+ max(0px, var(--_s-r) - var(--_n-l)) * 999
				+ var(--_C) * 99999px
			),
			calc(100% - var(--_eg) + var(--_C) * 99999px)
		);
		right: min(
			calc(var(--_s-r) + var(--_R) * 99999px),
			calc(
				max(
					0px,
					min(
						var(--_n-l),
						calc(
							(var(--_s-r) + var(--_n-l)) / 2
							- var(--_gm) / 2
						),
						max(
							min(
								calc(var(--_c-r) - var(--_eg)),
								calc(var(--_s-r) - var(--_eg))
							),
							calc(
								var(--_s-r)
								- (var(--_n-l) - var(--_s-r)) * 999
							)
						)
					)
				)
				+ var(--_C) * 99999px
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
	   push the element past the boundary. */
	.positioned.gap-after.last .svedit-selectable {
		top: min(
			calc(min(var(--_s-b), calc(var(--_b-bt) - var(--_eg))) + var(--_R) * 99999px),
			calc(var(--_s-t) + var(--_C) * 99999px)
		);
		bottom: min(
			calc(max(var(--_b-b), var(--_s-b) - var(--_eg)) + var(--_R) * 99999px),
			calc(var(--_s-b) + var(--_C) * 99999px)
		);
		left: min(
			calc(var(--_s-l) + var(--_R) * 99999px),
			calc(min(var(--_s-r), calc(var(--_b-rl) - var(--_eg))) + var(--_C) * 99999px),
			calc(100% - var(--_eg) + var(--_C) * 99999px)
		);
		right: min(
			calc(var(--_s-r) + var(--_R) * 99999px),
			calc(
				max(
					var(--_b-r),
					min(
						calc(var(--_c-r) - var(--_eg)),
						calc(var(--_s-r) - var(--_eg))
					)
				)
				+ var(--_C) * 99999px
			)
		);
		min-height: calc(var(--_eg) * var(--_C));
		min-width: calc(var(--_eg) * var(--_R));
	}

	/* Before first node: col extends up, row extends left */
	.positioned.gap-before:not(.empty) .svedit-selectable {
		top: min(
			calc(
				max(var(--_b-t), var(--_s-t) - var(--_eg))
				+ var(--_R) * 99999px
			),
			calc(var(--_s-t) + var(--_C) * 99999px)
		);
		bottom: min(
			calc(var(--_s-t) + var(--_R) * 99999px),
			calc(var(--_s-b) + var(--_C) * 99999px)
		);
		left: min(
			calc(var(--_s-l) + var(--_R) * 99999px),
			calc(
				max(var(--_b-l), var(--_s-l) - var(--_eg))
				+ var(--_C) * 99999px
			)
		);
		right: min(
			calc(var(--_s-r) + var(--_R) * 99999px),
			calc(var(--_s-l) + var(--_C) * 99999px)
		);
		min-height: calc(var(--_eg) * var(--_C));
		min-width: calc(var(--_eg) * var(--_R));
	}

	/* Empty array: spans the outermost edges of placeholder and container. */
	.positioned.gap-before.empty .svedit-selectable {
		top: min(var(--_s-t), var(--_c-t));
		bottom: min(var(--_s-b), var(--_c-b));
		left: min(var(--_s-l), var(--_c-l));
		right: min(var(--_s-r), var(--_c-r));
	}

	/* Debugging styles  */
	/* .positioned .svedit-selectable {
		outline: 0.1px solid rgba(238, 0, 255, 0.5);
		outline-offset: -0.5px;
	} */
</style>
