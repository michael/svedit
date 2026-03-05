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
	 * replicating the geometry of `NodeInsertionOverlay.svelte`'s `.gap`
	 * elements (the hit areas, not the markers).
	 *
	 * Each anchor() call is stored in a CSS custom property with a literal
	 * anchor name, then applied via var() at the property level. anchor()
	 * resolves contextually based on which inset property it's used in, so
	 * the same var can appear in both `left` and `right` and produce the
	 * correct value for each.
	 *
	 * Node.svelte does NOT set position: relative, so the selectable's
	 * containing block is a higher ancestor that contains all sibling
	 * nodes, making cross-sibling anchor references valid.
	 *
	 * Visual insertion affordances (markers, caret) are rendered by
	 * `NodeInsertionOverlay.svelte` with pointer-events: none.
	 */
	let { path, type, empty = false, last = false } = $props();

	let anchor_name = $derived(`--ct-${path.join('-')}-${type}`);
	let index = $derived(parseInt(String(path.at(-1)), 10));
	let array_path = $derived(path.slice(0, -1));

	let self = $derived(`--${path.join('-')}`);
	let next = $derived(`--${[...array_path, index + 1].join('-')}`);
	let container = $derived(`--${array_path.join('-')}`);

	let trap_style = $derived.by(() => {
		let s = `anchor-name:${anchor_name}`;
		s += `;--_pa:${self}`;
		s += `;--_s-t:anchor(${self} top)`;
		s += `;--_s-b:anchor(${self} bottom)`;
		s += `;--_s-l:anchor(${self} left)`;
		s += `;--_s-r:anchor(${self} right)`;
		if (type === 'after-node-cursor-trap' && !last) {
			s += `;--_n-t:anchor(${next} top)`;
			s += `;--_n-l:anchor(${next} left)`;
			s += `;--_c-r:anchor(${container} right)`;
		}
		if (last || empty) {
			s += `;--_c-t:anchor(${container} top)`;
			s += `;--_c-b:anchor(${container} bottom)`;
			s += `;--_c-l:anchor(${container} left)`;
			s += `;--_c-r:anchor(${container} right)`;
		}
		return s;
	});
</script>

<div
	class="cursor-trap {type}"
	class:empty
	class:last
	data-type={type}
	style={trap_style}
>
	<div class="svedit-selectable"><br /></div>
</div>

<style>
	.cursor-trap {
		height: 0;
		overflow: visible;
		outline: none;
		pointer-events: none;
		caret-color: transparent;
	}

	.svedit-selectable {
		--_eg: var(--node-cursor-edge-gap, 24px);
		--_gm: var(--node-cursor-gap-min-size, 16px);
		user-select: none;
		pointer-events: auto;
		position: absolute;
		position-anchor: var(--_pa);
		position-visibility: anchors-visible;
		z-index: var(--node-cursor-gap-z-index, 1);
		cursor: pointer;
	}

	/* ------------------------------------------------------------------ */
	/* Column layout (default)                                             */
	/* ------------------------------------------------------------------ */

	/* Between two siblings: centered vertically with min-size guarantee.
	   Mirrors NodeInsertionOverlay's .gap-col positioning. */
	.after-node-cursor-trap:not(.last) .svedit-selectable {
		--_mid: calc((var(--_s-b) + var(--_n-t)) / 2 - var(--_gm) / 2);
		top: min(var(--_s-b), var(--_mid));
		bottom: min(var(--_n-t), var(--_mid));
		left: var(--_s-l);
		right: var(--_s-r);
		min-height: var(--_gm);
	}

	/* After last node: extends downward by edge-gap. */
	.after-node-cursor-trap.last .svedit-selectable {
		top: var(--_s-b);
		left: var(--_s-l);
		right: var(--_s-r);
		min-height: var(--_eg);
	}

	/* Before first node: extends upward by edge-gap, clamped at CB top. */
	.position-zero-cursor-trap:not(.empty) .svedit-selectable {
		top: max(0px, calc(var(--_s-t) - var(--_eg)));
		bottom: var(--_s-t);
		left: var(--_s-l);
		right: var(--_s-r);
		min-height: var(--_eg);
	}

	/* Empty array: spans the outermost edges of placeholder and container. */
	.position-zero-cursor-trap.empty .svedit-selectable {
		top: min(var(--_s-t), var(--_c-t));
		bottom: min(var(--_s-b), var(--_c-b));
		left: min(var(--_s-l), var(--_c-l));
		right: min(var(--_s-r), var(--_c-r));
	}

	/* ------------------------------------------------------------------ */
	/* Row layout overrides (--row: 1 on ancestor)                         */
	/*                                                                     */
	/* Replicates NodeInsertionOverlay's .gap-row, .gap-edge.row, and      */
	/* .gap-trail hit area positioning. Uses the * 999 multiplier trick    */
	/* from the overlay for wrap detection in CSS grids.                    */
	/* ------------------------------------------------------------------ */

	@container style(--row: 1) {
		/* Between two siblings in row layout.
		   Same-line: centered between self.right and next.left.
		   Wrapped (next on new row): extends edge-gap past container. */
		.after-node-cursor-trap:not(.last) .svedit-selectable {
			top: var(--_s-t);
			bottom: var(--_s-b);
			min-height: unset;
			min-width: var(--_gm);
			left: min(
				var(--_s-r),
				calc(
					(var(--_s-r) + var(--_n-l)) / 2
					- var(--_gm) / 2
					+ max(0px, var(--_s-r) - var(--_n-l)) * 999
				),
				calc(100% - var(--_eg))
			);
			right: max(0px, min(
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
			));
		}

		/* After last node in row: extends edge-gap past container.
		   Mirrors .gap-trail / .gap-edge.row.last hit area. */
		.after-node-cursor-trap.last .svedit-selectable {
			top: var(--_s-t);
			bottom: var(--_s-b);
			min-height: unset;
			min-width: var(--_eg);
			left: min(var(--_s-r), calc(100% - var(--_eg)));
			right: max(0px, min(
				calc(var(--_c-r) - var(--_eg)),
				calc(var(--_s-r) - var(--_eg))
			));
		}

		/* Before first node in row: extends left, clamped at CB left.
		   Mirrors .gap-edge.row.first hit area. */
		.position-zero-cursor-trap:not(.empty) .svedit-selectable {
			top: var(--_s-t);
			bottom: var(--_s-b);
			right: var(--_s-l);
			left: max(0px, calc(var(--_s-l) - var(--_eg)));
			min-height: unset;
			min-width: var(--_eg);
		}
	}

	/* IMPORTANT DO NOT REMOVE THESE DEBUGGING STYLES */
	.svedit-selectable {
		outline: 1px solid rgb(238, 0, 255);
		outline-offset: -1px;
	}
	/* IMPORTANT DO NOT REMOVE THESE DEBUGGING STYLES */
</style>
