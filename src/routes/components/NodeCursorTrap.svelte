<script>
	/**
	 * Invisible keyboard cursor trap and gap hit area.
	 *
	 * This element serves two purposes:
	 * 1. A zero-height in-flow landing zone for keyboard caret navigation
	 * 2. An absolutely-positioned hit area covering the inter-node gap,
	 *    enabling native DOM selection on click/drag (pointer events)
	 *
	 * Anchor positioning sizes the hit area to match the inter-node gap,
	 * replicating the geometry of NodeInsertionMarkers.svelte's gap
	 * elements (the hit areas, not the markers).
	 *
	 * Row/column detection uses var(--row, 0) with the * 99999 multiplier
	 * trick — no @container style() queries, works in all browsers.
	 *
	 * Node.svelte does NOT set position: relative, so the selectable's
	 * containing block is a higher ancestor that contains all sibling
	 * nodes, making cross-sibling anchor references valid.
	 */
	let { path, type, empty = false, last = false } = $props();

	let trap_style = $derived.by(() => {
		const p = path.join('-');
		const arr = path.slice(0, -1).join('-');
		const idx = parseInt(String(path.at(-1)), 10);
		return `--_pa:--${p};--_next:--${arr}-${idx + 1};--_container:--${arr}`;
	});

	let anchor_name = $derived(`--ct-${path.join('-')}-${type}`);
</script>

<div
	class="cursor-trap {type}"
	class:empty
	class:last
	data-type={type}
	style={trap_style}
>
	<div class="svedit-selectable" style="anchor-name:{anchor_name}"><br /></div>
</div>


<style>
	.cursor-trap {
		height: 0;
		overflow: visible;
		outline: none;
		pointer-events: none;
		caret-color: transparent;
	}

	/*
	 * Anchor references resolved from CSS variable names passed via
	 * inline style (--_pa, --_next, --_container). Same pattern as
	 * NodeInsertionMarkers — keeps JS minimal and anchor() in CSS.
	 */
	.cursor-trap {
		--_s-t: anchor(var(--_pa) top);
		--_s-b: anchor(var(--_pa) bottom);
		--_s-l: anchor(var(--_pa) left);
		--_s-r: anchor(var(--_pa) right);
	}
	.after-node-cursor-trap:not(.last) {
		--_n-t: anchor(var(--_next) top);
		--_n-l: anchor(var(--_next) left);
		--_c-r: anchor(var(--_container) right);
	}
	.after-node-cursor-trap.last,
	.position-zero-cursor-trap.empty {
		--_c-t: anchor(var(--_container) top);
		--_c-b: anchor(var(--_container) bottom);
		--_c-l: anchor(var(--_container) left);
		--_c-r: anchor(var(--_container) right);
	}

	.svedit-selectable {
		--_eg: var(--node-cursor-edge-gap, 24px);
		--_gm: var(--node-cursor-gap-min-size, 16px);
		--_R: var(--row, 0);
		--_C: calc(1 - var(--row, 0));
		user-select: none;
		pointer-events: auto;
		position: absolute;
		position-anchor: var(--_pa);
		position-visibility: anchors-visible;
		z-index: var(--node-cursor-gap-z-index, 1);
		cursor: pointer;
	}

	/* ------------------------------------------------------------------ */
	/* Merged column / row layout positioning                              */
	/*                                                                    */
	/* Uses var(--row, 0) with the * 99999 multiplier trick:              */
	/*   --_R = var(--row, 0)          → 1 in row, 0 in column           */
	/*   --_C = calc(1 - var(--row, 0))→ 1 in column, 0 in row           */
	/* Inside min(), + var(--_R) * 99999px disables a col branch in row,  */
	/* + var(--_C) * 99999px disables a row branch in column.             */
	/* ------------------------------------------------------------------ */

	/* Between two siblings: col centers vertically, row centers horizontally */
	.after-node-cursor-trap:not(.last) .svedit-selectable {
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
	.after-node-cursor-trap.last .svedit-selectable {
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
	.position-zero-cursor-trap:not(.empty) .svedit-selectable {
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
	.position-zero-cursor-trap.empty .svedit-selectable {
		top: min(var(--_s-t), var(--_c-t));
		bottom: min(var(--_s-b), var(--_c-b));
		left: min(var(--_s-l), var(--_c-l));
		right: min(var(--_s-r), var(--_c-r));
	}

	/* IMPORTANT DO NOT REMOVE THESE DEBUGGING STYLES */
	.svedit-selectable {
		outline: 0.1px solid rgba(238, 0, 255, 0.5);
		outline-offset: -1px;
	}
	/* IMPORTANT DO NOT REMOVE THESE DEBUGGING STYLES */
</style>
