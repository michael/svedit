<script>
	import { getContext } from 'svelte';
	import NodeInsertionCaret from './NodeInsertionCaret.svelte';

	/**
	 * Visual-only insertion overlay for node-array editing.
	 *
	 * Renders insertion markers (dashed lines + symbols) and the active caret.
	 * Each marker anchors to the corresponding cursor trap's .svedit-selectable
	 * via --_ct, then applies narrowing overrides for edge and wrapped-row
	 * alignment. All pointer interaction is handled by the cursor traps inside
	 * the canvas (DOM selections drive everything).
	 */

	// -----------------------------------------------------------------------------
	// constants
	// -----------------------------------------------------------------------------

	// Tuned to avoid visible gap pop-in during fast scroll while still culling most offscreen gaps.
	const VIEWPORT_OVERSCAN_PX = 600;

	const NODE_ARRAY_SELECTOR = '[data-type="node_array"][data-path]';
	const NODE_SELECTOR = '[data-type="node"][data-path]';

	// -----------------------------------------------------------------------------
	// context and reactive state
	// -----------------------------------------------------------------------------

	const svedit = getContext('svedit');

	/** @type {Record<string, boolean>} Maps data-path -> true when layout uses row flow. */
	let row_layout_cache = $state({});

	/** @type {Map<string, Set<number>>} Maps array_path → set of visible child indices. */
	let visible_child_indices = $state.raw(new Map());

	// Raw ref preserves object identity for cheap stale-path checks.
	let visible_paths_doc = $state.raw(null);

	let cursor_gap_key = $derived.by(() => {
		const s = svedit.session.selection;
		if (s?.type !== 'node' || s.anchor_offset !== s.focus_offset) return null;
		return `${s.path.join('.')}-gap-${s.anchor_offset}`;
	});
	let gaps = $derived(build_all_gaps());

	// -----------------------------------------------------------------------------
	// DOM synchronization helpers
	// -----------------------------------------------------------------------------

	function sync_row_layout_cache_from_dom() {
		/** @type {Record<string, boolean>} */
		const next_row_layout_cache = {};
		for (const element of document.querySelectorAll(NODE_ARRAY_SELECTOR)) {
			const el = /** @type {HTMLElement} */ (element);
			if (el.dataset.path && getComputedStyle(el).getPropertyValue('--row').trim() === '1') {
				next_row_layout_cache[el.dataset.path] = true;
			}
		}
		row_layout_cache = next_row_layout_cache;
	}

	// -----------------------------------------------------------------------------
	// reactive effects
	// -----------------------------------------------------------------------------

	$effect(() => {
		// Re-run when the document changes. Keeps row-layout direction cache in sync.
		svedit.session.doc;

		sync_row_layout_cache_from_dom();
		window.addEventListener('resize', sync_row_layout_cache_from_dom);

		return () => {
			window.removeEventListener('resize', sync_row_layout_cache_from_dom);
		};
	});

	$effect(() => {
		// Keep viewport-near node visibility in sync using IntersectionObserver.
		// Observes individual node elements (not containers) so that gaps inside
		// large node_arrays are culled per-child rather than all-or-nothing.
		//
		// Performance impact (tested with ~2000-node benchmark document):
		// - Culling ON: ~20 gaps rendered (only around visible nodes)
		// - Culling OFF: ~2258 gaps rendered (every gap in the document)
		// - Reduction: ~99%, from ~4500 overlay DOM elements to ~40
		// - JS overhead is negligible; the real win is fewer DOM elements
		//   for the browser's layout engine to resolve (CSS anchor positioning).
		const doc_snapshot = svedit.session.doc;

		if (!svedit.editable) {
			visible_child_indices = new Map();
			visible_paths_doc = null;
			return;
		}

		/** @type {Map<string, Set<number>>} */
		const index_map = new Map();

		const observer = new IntersectionObserver(
			(entries) => {
				let did_change = false;
				for (const entry of entries) {
					const path = /** @type {HTMLElement} */ (entry.target).dataset.path;
					if (!path) continue;
					const parsed = parse_node_path(path);
					if (!parsed) continue;
					const { array_path, child_index } = parsed;

					if (entry.isIntersecting) {
						let set = index_map.get(array_path);
						if (!set) {
							set = new Set();
							index_map.set(array_path, set);
						}
						if (!set.has(child_index)) {
							set.add(child_index);
							did_change = true;
						}
					} else {
						const set = index_map.get(array_path);
						if (set && set.delete(child_index)) {
							did_change = true;
							if (set.size === 0) {
								index_map.delete(array_path);
							}
						}
					}
				}
				if (did_change) {
					visible_child_indices = new Map(index_map);
					visible_paths_doc = doc_snapshot;
				}
			},
			{
				root: null,
				rootMargin: `${VIEWPORT_OVERSCAN_PX}px`
			}
		);

		for (const element of document.querySelectorAll(NODE_SELECTOR)) {
			const node_element = /** @type {HTMLElement} */ (element);
			const parsed = parse_node_path(node_element.dataset.path);
			if (!parsed) continue;
			const { array_path, child_index } = parsed;

			const rect = node_element.getBoundingClientRect();
			if (
				rect.bottom >= -VIEWPORT_OVERSCAN_PX &&
				rect.top <= window.innerHeight + VIEWPORT_OVERSCAN_PX &&
				rect.right >= -VIEWPORT_OVERSCAN_PX &&
				rect.left <= window.innerWidth + VIEWPORT_OVERSCAN_PX
			) {
				let set = index_map.get(array_path);
				if (!set) {
					set = new Set();
					index_map.set(array_path, set);
				}
				set.add(child_index);
			}

			observer.observe(node_element);
		}

		visible_child_indices = new Map(index_map);
		visible_paths_doc = doc_snapshot;
		return () => observer.disconnect();
	});

	// -----------------------------------------------------------------------------
	// selection and path helpers
	// -----------------------------------------------------------------------------
	
	/**
	 * @typedef {{
	 *   key: string,
	 *   path: Array<string|number>,
	 *   offset: number,
	 *   type: string,
	 *   vars: string,
	 *   is_row: boolean,
	 *   is_first: boolean,
	 *   is_last: boolean
	 * }} gap_t
	 */

	/**
	 * Build gaps only for viewport-near node arrays.
	 * @returns {Array<gap_t>}
	 */
	function build_all_gaps() {
		if (!svedit.editable) return [];
		// Skip gap computation while DOM-derived paths still belong to a previous doc snapshot.
		// Prevents tearing errors (e.g. Enter inserts a node, doc updates before observer paths refresh).
		if (visible_paths_doc !== svedit.session.doc) return [];

		/** @type {Array<gap_t>} */
		const targets = [];
		for (const [array_path_str, indices] of visible_child_indices) {
			append_array_gaps(array_path_str, targets, indices);
		}
		return targets;
	}

	/**
	 * Split a dot-separated node path into its parent array path and terminal child index.
	 * @param {string} path
	 * @returns {{ array_path: string, child_index: number } | null}
	 */
	function parse_node_path(path) {
		const dot = path.lastIndexOf('.');
		if (dot < 0) return null;
		const child_index = parseInt(path.slice(dot + 1), 10);
		if (Number.isNaN(child_index)) return null;
		return { array_path: path.slice(0, dot), child_index };
	}

	/**
	 * Emit gaps for a specific node_array path.
	 *
	 * Each gap carries a --_ct var pointing at the cursor trap's .svedit-selectable
	 * anchor. The marker CSS anchors to that element for base positioning, then
	 * applies narrowing overrides for edge and wrapped-row alignment.
	 *
	 * @param {string} array_path_str
	 * @param {Array<gap_t>} targets
	 * @param {Set<number> | null} visible_indices - visible child indices, or null for empty arrays
	 * @returns {void}
	 */
	function append_array_gaps(array_path_str, targets, visible_indices) {
		const array_path = array_path_str.split('.');
		try {
			const info = svedit.session.inspect(array_path);
			if (info.kind !== 'property' || info.type !== 'node_array') return;
		} catch {
			return;
		}
		const node_ids = svedit.session.get(array_path);
		if (!Array.isArray(node_ids)) return;

		const is_row = row_layout_cache[array_path_str] === true;
		const anchor_prefix = `--${array_path.join('-')}`;
		const ct_prefix = `--ct-${array_path.join('-')}`;
		const count = node_ids.length;

		if (count === 0) {
			targets.push({
				key: `${array_path_str}-gap-0`,
				path: array_path,
				offset: 0,
				type: 'gap-empty',
				vars: `--_ct:${ct_prefix}-0-position-zero-cursor-trap;--_a:${anchor_prefix}-0`,
				is_row,
				is_first: true,
				is_last: true
			});
			return;
		}

		const ref_first = is_row && count >= 2 ? `${anchor_prefix}-0` : null;
		const ref_second = is_row && count >= 2 ? `${anchor_prefix}-1` : null;

		for (let offset = 0; offset <= count; offset++) {
			if (visible_indices) {
				const prev_visible = offset > 0 && visible_indices.has(offset - 1);
				const next_visible = offset < count && visible_indices.has(offset);
				if (!prev_visible && !next_visible) continue;
			}

			const is_first = offset === 0;
			const is_last = offset === count;
			const ct_anchor = offset === 0
				? `${ct_prefix}-0-position-zero-cursor-trap`
				: `${ct_prefix}-${offset - 1}-after-node-cursor-trap`;

			let type, vars;
			if (!is_first && is_row && count >= 2) {
				type = 'gap-row';
				const p_anchor = `${anchor_prefix}-${offset - 1}`;
				const n_anchor = is_last ? ct_anchor : `${anchor_prefix}-${offset}`;
				vars = `--_ct:${ct_anchor};--_p:${p_anchor};--_f:${ref_first};--_s:${ref_second};--_n:${n_anchor};--_c:${anchor_prefix}`;
			} else if (!is_first && !is_last) {
				type = 'gap-col';
				vars = `--_ct:${ct_anchor}`;
			} else {
				type = 'gap-edge';
				const adjacent = is_first ? `${anchor_prefix}-0` : `${anchor_prefix}-${count - 1}`;
				vars = is_row && is_last
					? `--_ct:${ct_anchor};--_a:${adjacent};--_c:${anchor_prefix}`
					: `--_ct:${ct_anchor};--_a:${adjacent}`;
			}
			targets.push({
				key: `${array_path_str}-gap-${offset}`,
				path: array_path,
				offset,
				type,
				vars,
				is_row,
				is_first,
				is_last
			});
		}
	}

</script>

<div class="gaps-layer" role="none">
	{#each gaps as gap (gap.key)}
		<div
			class="gap-marker {gap.type}"
			class:active={gap.key === cursor_gap_key}
			class:row={gap.is_row}
			class:first={gap.is_first}
			class:last={gap.is_last}
			style={gap.vars}
		>
			{#if gap.key === cursor_gap_key}
				<NodeInsertionCaret is_row={gap.is_row} />
			{/if}
		</div>
	{/each}
</div>

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

	.gaps-layer {
		pointer-events: none;
	}

	/* Suppress caret blink during active click on a cursor trap. */
	:global(.svedit-canvas:active) ~ .gaps-layer .gap-marker {
		--node-cursor-caret-animation: none;
	}

	/* Empty horizontal: caret at the left boundary. */
	.gap-marker.gap-empty.row {
		--node-cursor-caret-row-inline-position: 0px;
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

	/* Empty array: marker spans the placeholder for the dashed outline. */
	.gap-marker.gap-empty {
		top: anchor(var(--_a) top);
		left: anchor(var(--_a) left);
		bottom: anchor(var(--_a) bottom);
		right: anchor(var(--_a) right);
		&.row {
			right: max(anchor(var(--_a) right), calc(anchor(var(--_a) left) - var(--_eg)));
		}
	}

	/*
	 * Row gap marker: same-line gaps keep full width; wrapped line-ends
	 * narrow to max(ref_gap, gm) for visual alignment.
	 *
	 * Uses --_p (previous node) and --_n (next node) directly instead of
	 * --_ct (cursor trap), because the trap's left can be clamped by its
	 * 100% - edge-gap rule near screen boundaries.
	 *
	 * In right-edge coordinates:
	 *   ref_gap = anchor(--_f right) - anchor(--_s left)
	 *           = second.left - first.right  (positive value)
	 */
	.gap-marker.gap-row {
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

	/* Trailing gap (last offset in a row): --_n = --_ct (self-ref) so the
	   same-line detection in the base rule fails. Override with --_p based
	   positioning (--_p = last node, same as old --_l). */
	.gap-marker.gap-row.last {
		left: min(
			anchor(var(--_p) right),
			calc(
				anchor(var(--_p) right)
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
					- (anchor(var(--_c) right) - anchor(var(--_p) right))
					- 0.5px
				) * 9999
			)
		);
		right: max(
			0px,
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
			min(
				anchor(var(--_c) right),
				calc(anchor(var(--_p) right) - var(--_eg))
			)
		);
	}

	/* Edge gap markers: narrowed from edge-gap to gap-min-size.
	   Anchors to the adjacent NODE (--_a) rather than the cursor trap,
	   because the trap's min-width/min-height can expand it past the
	   node edge near screen boundaries. */
	.gap-marker.gap-edge {
		min-height: var(--_gm);
		min-width: var(--_gm);
		&.row.first {
			right: anchor(var(--_a) left);
			left: max(0px, calc(anchor(var(--_a) left) - var(--_gm)));
		}
		&.row.last {
			left: min(anchor(var(--_a) right), calc(100% - var(--_gm)));
			right: max(
				0px,
				calc(anchor(var(--_a) right) - var(--_gm)),
				anchor(var(--_c) right)
			);
		}
		&:not(.row).first {
			bottom: anchor(var(--_a) top);
			top: max(0px, calc(anchor(var(--_a) top) - var(--_gm)));
		}
		&:not(.row).last {
			top: anchor(var(--_a) bottom);
			bottom: calc(anchor(var(--_a) bottom) - var(--_gm));
		}
	}

	/* Marker visuals (line + symbol). Hidden when active (caret replaces them). */
	.gap-marker:not(.active) {
		&::before {
			content: '';
			position: absolute;
			--gap-center: calc( var(--node-cursor-symbol-size, 6px) / 2 + var(--node-cursor-symbol-gap, 4px) );
		}
		/* Column layout marker (horizontal dashed line). */
		&:not(.row):not(.gap-empty)::before {
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
		/* Row layout marker (vertical dashed line). */
		&.row:not(.gap-empty)::before {
			top: var(--node-cursor-marker-inset, 2px);
			bottom: var(--node-cursor-marker-inset, 2px);
			left: 50%;
			width: 0;
			border-left: var(--node-cursor-line-border, 1px dashed var(--node-cursor-gap-color, var(--stroke-color)));
			transform: translateX(-0.5px);
			mask-image: linear-gradient(to bottom,
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

	/* Debugging styles — REMOVE ONLY BEFORE MERGING THE PR */
	:global([data-type="node_array"]) {
		outline: 0.1px solid green;
	}
	.gap-marker {
		outline: 0.1px solid blue;
		outline-offset: -2px;
	}
</style>