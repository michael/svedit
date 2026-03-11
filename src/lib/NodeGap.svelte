<script>
	/**
	 * Invisible keyboard caret selectable and gap hit area.
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
	 *
	 * Node.svelte does NOT set position: relative, so the selectable's
	 * containing block is a higher ancestor that contains all sibling
	 * nodes, making cross-sibling anchor references valid.
	 */
	let { path, type, empty = false, last = false, positioned = true } = $props();

	let gap_style = $derived.by(() => {
		const p = path.join('-');
		const arr = path.slice(0, -1).join('-');
		const idx = parseInt(String(path.at(-1)), 10);
		return `--_pa:--${p};--_next:--${arr}-${idx + 1};--_container:--${arr}`;
	});

	let anchor_name = $derived(`--g-${path.join('-')}-${type}`);
</script>

<div
	class="node-gap {type}"
	class:empty
	class:last
	class:positioned
	data-type={type}
	style={gap_style}
>
	<div class="svedit-selectable" style="anchor-name:{anchor_name}"><br /></div>
</div>


<style>
	.node-gap {
		height: 0;
		overflow: visible;
		outline: none;
		pointer-events: none;
		caret-color: transparent;
	}

	/* ------------------------------------------------------------------ */
	/* Un-positioned: minimal in-DOM presence, no anchor resolution        */
	/* ------------------------------------------------------------------ */

	.node-gap:not(.positioned) .svedit-selectable {
		content-visibility: hidden;
	  contain-intrinsic-size: 0 0;
		position: static;
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
	 * inline style (--_pa, --_next, --_container). Same pattern as
	 * NodeGapMarkers — keeps JS minimal and anchor() in CSS.
	 */
	.node-gap.positioned {
		--_s-t: anchor(var(--_pa) top);
		--_s-b: anchor(var(--_pa) bottom);
		--_s-l: anchor(var(--_pa) left);
		--_s-r: anchor(var(--_pa) right);
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
	}

	/* After last node: col extends down, row extends right */
	.positioned.gap-after.last .svedit-selectable {
		top: min(
			calc(var(--_s-b) + var(--_R) * 99999px),
			calc(var(--_s-t) + var(--_C) * 99999px)
		);
		bottom: min(
			calc(var(--_s-b) - var(--_eg) + var(--_R) * 99999px),
			calc(var(--_s-b) + var(--_C) * 99999px)
		);
		left: min(
			calc(var(--_s-l) + var(--_R) * 99999px),
			calc(var(--_s-r) + var(--_C) * 99999px),
			calc(100% - var(--_eg) + var(--_C) * 99999px)
		);
		right: min(
			calc(var(--_s-r) + var(--_R) * 99999px),
			calc(
				max(
					0px,
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
				max(0px, var(--_s-t) - var(--_eg))
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
				max(0px, var(--_s-l) - var(--_eg))
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
