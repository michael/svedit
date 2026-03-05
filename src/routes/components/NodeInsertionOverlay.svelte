<script>
	import { getContext } from 'svelte';
	import NodeInsertionCaret from './NodeInsertionCaret.svelte';

	/**
	 * Interactive insertion overlay for node-array editing.
	 *
	 * This component builds viewport-aware insertion gaps, handles pointer-based
	 * node selection updates, and renders insertion markers plus the active caret.
	 */

	// -----------------------------------------------------------------------------
	// constants
	// -----------------------------------------------------------------------------

	const DRAG_THRESHOLD_PX = 4;
	// Tuned to avoid visible gap pop-in during fast scroll while still culling most offscreen gaps.
	const VIEWPORT_OVERSCAN_PX = 600;

	const NODE_ARRAY_SELECTOR = '[data-type="node_array"][data-path]';
	const NODE_SELECTOR = '[data-type="node"][data-path]';

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
		const count = node_ids.length;

		if (count === 0) {
			const anchor = `${anchor_prefix}-0`;
			targets.push({
				key: `${array_path_str}-gap-0`,
				path: array_path,
				offset: 0,
				type: 'gap-empty',
				vars: `--_a:${anchor};--_c:${anchor_prefix}`,
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

			const prev = offset > 0 ? `${anchor_prefix}-${offset - 1}` : null;
			const next = offset < count ? `${anchor_prefix}-${offset}` : null;
			const is_first = offset === 0;
			const is_last = offset === count;

			let type, vars;
			if (prev && next) {
				type = is_row ? 'gap-row' : 'gap-col';
				vars = is_row && ref_first
					? `--_p:${prev};--_n:${next};--_f:${ref_first};--_s:${ref_second};--_c:${anchor_prefix}`
					: `--_p:${prev};--_n:${next}`;
			} else if (prev && ref_first) {
				type = 'gap-trail';
				vars = `--_l:${prev};--_f:${ref_first};--_s:${ref_second};--_c:${anchor_prefix}`;
			} else {
				type = 'gap-edge';
				vars = is_row && is_last && prev
					? `--_a:${prev};--_c:${anchor_prefix}`
					: `--_a:${prev || next}`;
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

	/**
	 * Walk up the DOM from `el` to find the closest node element that belongs
	 * to the given node_array path.
	 * @param {Element} el
	 * @param {string} array_path_str
	 * @returns {HTMLElement | null}
	 */
	function find_closest_node_in_array(el, array_path_str) {
		let node_el = /** @type {HTMLElement | null} */ (el.closest(NODE_SELECTOR));
		const prefix = array_path_str ? array_path_str + '.' : '';
		while (node_el) {
			const path = node_el.dataset.path;
			if (path && path.startsWith(prefix) && path.indexOf('.', prefix.length) === -1) return node_el;
			node_el = /** @type {HTMLElement | null} */ (node_el.parentElement?.closest(NODE_SELECTOR));
		}
		return null;
	}

	// -----------------------------------------------------------------------------
	// pointer and mouse handlers
	// -----------------------------------------------------------------------------

	const PATH_SEGMENT_STEP = 2; // Path alternates [node_id, prop, ...], so parent walk steps by 2.
	const MIN_ANCESTOR_PATH_SEGMENTS = 2; // Smallest ancestor path shape that can still address an array.

	/**
	 * Pointerdown on a gap. Sets a collapsed node cursor immediately,
	 * then tracks pointer movement to support drag-selection across multiple nodes.
	 * @param {PointerEvent} e
	 * @returns {void}
	 */
	function on_gap_pointerdown(e) {
		const gap_data = get_gap_from_target(e.target);
		if (!gap_data) return;
		const { gap, gap_element: origin_element } = gap_data;
		e.preventDefault();

		// Place a collapsed cursor at this gap immediately.
		svedit.session.selection = {
			type: 'node',
			path: gap.path,
			anchor_offset: gap.offset,
			focus_offset: gap.offset
		};

		const start_x = e.clientX;
		const start_y = e.clientY;
		const array_path_str = gap.path.join('.');
		let dragging = false;

		// Pre-compute ancestor array paths for cross-level escalation.
		// Path format alternates [node_id, prop, child_index, prop, ...],
		// so stripping two segments yields the parent array path.
		/** @type {Array<{ path: Array<string|number>, str: string, container_index: number }>} */
		const ancestor_paths = [];
		for (
			let len = gap.path.length - PATH_SEGMENT_STEP;
			len >= MIN_ANCESTOR_PATH_SEGMENTS;
			len -= PATH_SEGMENT_STEP
		) {
			const container_index = parseInt(String(gap.path[len]), 10);
			if (Number.isNaN(container_index)) continue;

			const path = gap.path.slice(0, len);
			ancestor_paths.push({ path, str: path.join('.'), container_index });
		}

		function on_pointermove(/** @type {PointerEvent} */ e) {
			// Ignore micro-movements to distinguish click from drag.
			if (!dragging) {
				const pointer_delta = Math.abs(e.clientX - start_x) + Math.abs(e.clientY - start_y);
				if (pointer_delta < DRAG_THRESHOLD_PX) return;
				dragging = true;
			}

			const hit_elements = document.elementsFromPoint(e.clientX, e.clientY);

			// Pass 0: dragging over gaps should also expand/collapse selection.
			// This avoids requiring the pointer to cross node bodies.
			let hovered_gap = null;
			for (const el of hit_elements) {
				hovered_gap = get_gap_from_target(el)?.gap;
				if (hovered_gap) break;
			}
			if (hovered_gap) {
				const hovered_path_str = hovered_gap.path.join('.');

				if (hovered_path_str === array_path_str) {
					svedit.session.selection = {
						type: 'node',
						path: gap.path,
						anchor_offset: gap.offset,
						focus_offset: hovered_gap.offset
					};
					return;
				}

				for (const ancestor of ancestor_paths) {
					if (hovered_path_str !== ancestor.str) continue;
					const sel_anchor = hovered_gap.offset > ancestor.container_index
						? ancestor.container_index
						: ancestor.container_index + 1;
					svedit.session.selection = {
						type: 'node',
						path: ancestor.path,
						anchor_offset: sel_anchor,
						focus_offset: hovered_gap.offset
					};
					return;
				}
			}

			let node_el = null;
			let sel_path = gap.path;
			let sel_anchor = gap.offset;

			// Pass 1: look for a node in the same array.
			for (const hit_element of hit_elements) {
				node_el = find_closest_node_in_array(hit_element, array_path_str);
				if (node_el) break;
			}

			// Pass 2: try ancestor arrays only if same-level found nothing.
			// Skip matches that resolve to the container itself - that just
			// means the pointer is still inside it, not over a sibling.
			if (!node_el) {
				for (const hit_element of hit_elements) {
					for (const ancestor of ancestor_paths) {
						const candidate = find_closest_node_in_array(hit_element, ancestor.str);
						if (!candidate) continue;
						const idx = parse_node_path(candidate.dataset.path)?.child_index ?? null;
						if (idx === null) continue;
						if (idx === ancestor.container_index) break;
						node_el = candidate;
						sel_path = ancestor.path;
						sel_anchor = idx > ancestor.container_index
							? ancestor.container_index
							: ancestor.container_index + 1;
						break;
					}
					if (node_el) break;
				}
			}

			if (node_el) {
				// Expand selection toward the node the pointer is over.
				const node_index = parse_node_path(node_el.dataset.path)?.child_index ?? null;
				if (node_index === null) return;

				svedit.session.selection = {
					type: 'node',
					path: sel_path,
					anchor_offset: sel_anchor,
					focus_offset: node_index >= sel_anchor ? node_index + 1 : node_index
				};
			} else if (hit_elements.includes(origin_element)) {
				// Back over the starting gap: collapse selection (cancel drag).
				svedit.session.selection = {
					type: 'node',
					path: gap.path,
					anchor_offset: gap.offset,
					focus_offset: gap.offset
				};
			}
			// Over unrelated gaps or empty space: keep current selection as-is.
		}

		const controller = new AbortController();
		const abort = () => controller.abort();
		const opts = { signal: controller.signal };
		window.addEventListener('pointermove', on_pointermove, opts);
		window.addEventListener('pointerup', abort, opts);
		window.addEventListener('pointercancel', abort, opts);
		window.addEventListener('blur', abort, opts);
	}

	// -----------------------------------------------------------------------------
	// event target helpers
	// -----------------------------------------------------------------------------

	/**
	 * Resolve gap data from an event target by finding the closest gap element.
	 * @param {EventTarget | null} event_target
	 * @returns {{ gap: gap_t, gap_element: HTMLElement } | null}
	 */
	function get_gap_from_target(event_target) {
		const target = /** @type {Element | null} */ (event_target);
		if (!target?.closest) return null;
		const gap_element = /** @type {HTMLElement | null} */ (target.closest('.gap[data-index]'));
		const gap = gaps[gap_element?.dataset.index];
		return gap ? { gap, gap_element } : null;
	}

	/**
	 * Double-click on a gap smoothly scrolls it into view.
	 * @param {MouseEvent} e
	 * @returns {void}
	 */
	function on_gap_dblclick(e) {
		const gap_data = get_gap_from_target(e.target);
		if (!gap_data) return;
		e.preventDefault();
		e.stopPropagation();
		gap_data.gap_element.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
</script>

<div class="gaps-layer" onpointerdown={on_gap_pointerdown} ondblclick={on_gap_dblclick} role="none">
	{#each gaps as gap, i (gap.key)}
		<div
			class="gap {gap.type}"
			data-index={i}
			class:active={gap.key === cursor_gap_key}
			class:row={gap.is_row}
			class:first={gap.is_first}
			class:last={gap.is_last}
			style={gap.vars}
			role="none"
		></div>
		<div
			class="gap-marker {gap.type}"
			class:active={gap.key === cursor_gap_key}
			class:row={gap.is_row}
			class:first={gap.is_first}
			class:last={gap.is_last}
			style={gap.vars}
		>
			{#if gap.key === cursor_gap_key}
				<!-- Keep caret inside active gap to avoid fragile anchor chaining (Safari). -->
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
	 * --node-cursor-hit-padding
	 * --node-cursor-marker-padding
	 * --node-cursor-gap-z-index
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

	/* Pause blink while pointer is held down. */
	.gap:active + .gap-marker {
		--node-cursor-caret-animation: none;
	}

	/* Empty horizontal: caret at the left boundary. */
	.gap-marker.gap-empty.row {
		--node-cursor-caret-row-inline-position: 0px;
	}

	.gap, .gap-marker {
		--_eg: var(--node-cursor-edge-gap, 24px); /* Edge insertion hit size (before-first / after-last). */
		--_gm: var(--node-cursor-gap-min-size, 16px); /* Minimum marker/gap size used in geometry math. */
		position: absolute;
		position-visibility: anchors-visible; /* hides if anchors haven't been laid out yet */
	}

	/*
	 * Hit area element - handles pointer events, defines the clickable region.
	 *
	 * Design goals:
	 * - Keep insertion affordance subtle (dashed line + symbol), so content stays primary.
	 * - Keep marker and caret on the same axis to avoid visual jumps on activation.
	 * - Keep a tiny inset so gaps read as "between content", not content containers.
	 */
	.gap {
		min-height: var(--_gm);
		min-width: var(--_gm);
		cursor: pointer;
		z-index: var(--node-cursor-gap-z-index, 1);
		padding: var(--node-cursor-hit-padding, 2px); /* add some gap so the gap doesn't touch neighboring nodes */
		container-type: size;
	}

	/*
	 * Visual marker element - sibling of the hit area, shares the same
	 * containing block so anchor() resolves correctly on it.
	 *
	 * For same-line gaps: identical position to the hit area -> 50% centers the marker.
	 * For line-end gaps: narrowed to max(ref_gap, min_size) via anchor() overrides
	 * on its own right property -> 50% = half the reference gap, visually aligned
	 * with between-node markers.
	 */
	.gap-marker {
		pointer-events: none;
		z-index: var(--node-cursor-marker-z-index, 2);
		padding: var(--node-cursor-marker-padding, 2px);
	}

	/*
	 * Anchor-positioning rules for each gap type.
	 *
	 * Architecture: each gap produces TWO sibling elements:
	 *   .gap - the invisible click target (hit area)
	 *   .gap-marker       - the visible insertion marker (line + symbol)
	 *
	 * Both carry the type class (gap-empty, gap-col, gap-row, gap-edge, gap-trail),
	 * so the base positioning rules below apply to both identically.
	 * The gap-marker then overrides only the `right` property for line-end
	 * gaps, narrowing itself to max(ref_gap, min_size) so that the 50%
	 * midpoint (where ::before/::after draw the visual) aligns with
	 * between-node markers.
	 *
	 * Anchor CSS custom properties (set via inline style on each element):
	 *   --_a  anchor   (the node this gap is adjacent to - empty / edge)
	 *   --_p  prev     (the node before this gap - col / row)
	 *   --_n  next     (the node after this gap - col / row)
	 *   --_l  last     (the last node in the array - trailing row)
	 *   --_f  first    (reference item 0 - for measuring inter-node gap)
	 *   --_s  second   (reference item 1 - for measuring inter-node gap)
	 *   --_c  container (the node-array container)
	 *
	 * Edge clamping strategy:
	 *   When a node array has no padding/margin, gaps at the
	 *   edges extend past .svedit (the containing block). To keep them
	 *   visible:
	 *     - Outward insets use max(0px, ...) to clamp to the CB edge
	 *     - Opposite insets use min(..., 100% - edge-gap) to guarantee
	 *       minimum width/height, causing an inward shift rather than shrink
	 *     - min-width/min-height on .gap-edge cooperates with over-constrained
	 *       insets to achieve shift behavior in LTR (left takes precedence)
	 */

	/* Empty array - marker covers the placeholder, hit area fills the container.
	   --_a is the placeholder element; --_c is the node-array container. */
	.gap-marker.gap-empty {
		top: anchor(var(--_a) top);
		left: anchor(var(--_a) left);
		bottom: anchor(var(--_a) bottom);
		right: anchor(var(--_a) right);
		&.row {
			/* Ensure minimum edge-gap width even when the placeholder is narrow */
			right: max(anchor(var(--_a) right), calc(anchor(var(--_a) left) - var(--_eg)));
		}
	}

	/* Hit area expands to fill the full container. Uses min() on each inset to
	   take the outermost edge of either the placeholder or the container. This
	   handles collapsed containers (when the placeholder has position: absolute,
	   the container can collapse to zero height). */
	.gap.gap-empty {
		top: min(anchor(var(--_a) top), anchor(var(--_c) top));
		left: min(anchor(var(--_a) left), anchor(var(--_c) left));
		bottom: min(anchor(var(--_a) bottom), anchor(var(--_c) bottom));
		right: min(anchor(var(--_a) right), anchor(var(--_c) right));
	}

	/*
	 * Column gap - between two siblings in a vertical layout.
	 * min() on top/bottom enforces var(--_gm) around the midpoint.
	 */
	.gap-col {
		top: min(
			anchor(var(--_p) bottom),
			calc((anchor(var(--_p) bottom) + anchor(var(--_n) top)) / 2
				- var(--_gm) / 2)
		);
		bottom: min(
			anchor(var(--_n) top),
			calc((anchor(var(--_p) bottom) + anchor(var(--_n) top)) / 2
				- var(--_gm) / 2)
		);
		left: min(anchor(var(--_p) right), anchor(var(--_n) left));
		right: min(anchor(var(--_p) right), anchor(var(--_n) left));
	}

	/*
	 * Row gap - between two siblings in a horizontal layout.
	 *
	 * This rule handles BOTH same-line gaps and wrapped line-end gaps using
	 * pure CSS math with a * 999 multiplier trick for wrap detection:
	 *
	 *   Same line (prev.right < next.left):
	 *     The gap between prev and next is positive. The * 999 term in left
	 *     explodes to a huge value, disqualifying that min() branch. Result:
	 *     centered between prev.right and next.left with min-size guarantee.
	 *
	 *   Wrapped (prev.right > next.left - next is on the line below):
	 *     The gap is negative, so max(0, gap) * 999 = 0, and the third left
	 *     term wins: offset by half the reference gap (measured between items
	 *     0 and 1 via --_f/--_s) to visually align with between-node markers.
	 *     Right extends edge-gap past the container for a large click target.
	 *
	 * Edge clamping (last two terms):
	 *   left: min(..., 100% - edge-gap) ensures the box is at least edge-gap
	 *         wide when the right edge is clamped to 0.
	 *   right: max(0px, ...) prevents the box from extending past the
	 *          containing block (.svedit), keeping it visible on screen.
	 */
	.gap-row {
		top: anchor(var(--_p) top);
		bottom: anchor(var(--_p) bottom);
		left: min(
			/* Fallback: start at prev.right (always valid) */
			anchor(var(--_p) right),
			/* Same-line: center between prev and next with min-size guarantee.
			   max(0, prev.right - next.left) * 999 explodes when on the same line
			   (gap is positive -> huge offset disqualifies this branch via min). */
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--_gm) / 2
				+ max(0px, anchor(var(--_p) right) - anchor(var(--_n) left)) * 999
			),
			/* Edge clamp: keep left <= CB width - edge-gap so the box has at
			   least edge-gap width when right is clamped to 0 at screen edge */
			calc(100% - var(--_eg))
		);
		right: max(0px, min(
			/* Same-line: right edge at next.left */
			anchor(var(--_n) left),
			/* Same-line centering from the right side */
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--_gm) / 2
			),
			/* Wrapped: extends edge-gap past the container (large click target).
			   The * 999 term locks this branch off when on the same line. */
			max(
				min(
					calc(anchor(var(--_c) right) - var(--_eg)),
					calc(anchor(var(--_p) right) - var(--_eg))
				),
				calc(
					anchor(var(--_p) right)
						- (anchor(var(--_n) left) - anchor(var(--_p) right)) * 999
				)
			)
		));
	}

	/*
	 * Edge gaps - before the first or after the last item in an array.
	 *
	 * These extend outward from the boundary node by --node-cursor-edge-gap. When the
	 * array is flush with the screen edge (no padding), the outward extension
	 * would be off-screen. Two CSS tricks fix this:
	 *
	 *   max(0px, ...) on the outward inset - clamps the box to the containing
	 *   block edge (0 = .svedit's left/top).
	 *
	 *   min(..., 100% - edge-gap) on the opposite inset - ensures the box
	 *   stays at least edge-gap wide/tall even when the outward edge clamps
	 *   to 0. In LTR, left takes precedence over right in over-constrained
	 *   layouts, so min-width + clamped left = rightward shift. For right/
	 *   bottom edges where the element would grow the wrong way, the min()
	 *   on the opposite inset forces the shift direction instead.
	 *
	 * min-width/min-height on .gap-edge cooperates with the clamped inset:
	 * when the outward inset is 0 and the opposite inset is close, the
	 * browser resolves the over-constraint by adjusting the non-dominant
	 * inset, effectively shifting the box inward.
	 */
	.gap-edge {
		min-height: var(--_eg);
		min-width: var(--_eg);
		&.row {
			top: anchor(var(--_a) top);
			bottom: anchor(var(--_a) bottom);
			/* First horizontal edge: extends left of node, clamped to CB left. */
			&.first {
				right: anchor(var(--_a) left);
				left: max(0px, calc(anchor(var(--_a) left) - var(--_eg)));
			}
			/* Last horizontal edge: extends right of node, clamped to CB right.
			   left is capped at 100% - edge-gap to guarantee minimum width. */
			&.last {
				left: min(anchor(var(--_a) right), calc(100% - var(--_eg)));
				right: max(0px, min(
					anchor(var(--_c) right),
					calc(anchor(var(--_a) right) - var(--_eg))
				));
			}
		}
		&:not(.row) {
			left: anchor(var(--_a) left);
			right: anchor(var(--_a) right);
			/* First vertical edge: extends above the first node. */
			&.first {
				bottom: anchor(var(--_a) top);
				top: max(0px, calc(anchor(var(--_a) top) - var(--_eg)));
			}
			/* Last vertical edge: extends below the last node. */
			&.last {
				top: anchor(var(--_a) bottom);
				bottom: calc(anchor(var(--_a) bottom) - var(--_eg));
			}
		}
	}

	/*
	 * Trailing row gap - after the last item in a horizontal layout (>= 2 items).
	 * Always a line-end: extends from last.right toward the container edge.
	 *
	 * Left offset uses the same ref-gap centering as gap-row wrapped, so the
	 * dashed marker line at 50% aligns with between-node markers across rows.
	 *
	 * Right extends edge-gap past the container for a large click target.
	 * max(0px, ...) prevents overflow past the containing block (.svedit).
	 * The left min(..., 100% - edge-gap) term ensures minimum width when right
	 * clamps to 0 at the screen edge.
	 */
	.gap-trail {
		top: anchor(var(--_l) top);
		bottom: anchor(var(--_l) bottom);
		left: min(
			/* Fallback: start at last.right */
			anchor(var(--_l) right),
			/* Centering offset: shift right by half ref_gap minus half
			   max(ref_gap, min_size). Aligns the 50% marker line with
			   between-node markers. ref_gap = item1.left - item0.right. */
			calc(
				anchor(var(--_l) right)
				+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
				- max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--_gm)
				) / 2
				+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
			),
			/* Edge clamp: minimum width guarantee at screen edge */
			calc(100% - var(--_eg))
		);
		right: max(0px, min(
			calc(anchor(var(--_c) right) - var(--_eg)),
			calc(anchor(var(--_l) right) - var(--_eg))
		));
	}

	/* gap-trail marker: narrowed to max(ref_gap, min_size) so the 50% marker
	   line aligns with between-node markers. Capped at the container edge.
	   The right-coordinate ref_gap = anchor(--_f right) - anchor(--_s left)
	   = second.left - first.right (positive in right-edge coordinates).
	   max() picks the most constrained (largest) right value:
	     - 0px: edge clamp, prevents overflow past .svedit
	     - centering formula: narrows the marker to ref-gap-aligned width
	     - container cap: prevents excessive overflow beyond the array */
	.gap-marker.gap-trail {
		left: min(
			/* Fallback: start at last.right */
			anchor(var(--_l) right),
			/* Centering offset: shift right by half ref_gap minus half
			   max(ref_gap, min_size). Aligns the 50% marker line with
			   between-node markers. ref_gap = item1.left - item0.right. */
			calc(
				anchor(var(--_l) right)
				+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
				- max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--_gm)
				) / 2
				+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
			),
			/* Clamp 1: basic minimum width guarantee at screen edge */
			calc(100% - var(--_gm)),
			/* Clamp 2: enforces ref_gap width, but explodes and gets ignored
			   if space_available < ref_gap. */
			calc(
				100% - max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--_gm)
				)
				+ max(0px,
					(max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)))
					- (anchor(var(--_c) right) - anchor(var(--_l) right))
					- 0.5px
				) * 9999
			)
		);
		right: max(
			0px,
			/* Branch 1: normal ref_gap width */
			calc(
				anchor(var(--_l) right)
				- (
					max(0px, anchor(var(--_f) right) - anchor(var(--_s) left))
					+ max(
						max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)),
						var(--_gm)
					)
				) / 2
				- max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)) * 9999
			),
			/* Branch 2: snap to gap-min-size if space is tight. */
			calc(
				anchor(var(--_l) right) - var(--_gm)
				- max(0px,
					(anchor(var(--_l) right) - anchor(var(--_c) right))
					- (max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)))
					+ 0.5px
				) * 9999
			),
			/* Branch 3: fixed gap-min-size when completely wrapped (ref_gap = 0).
			   Explodes if there is a gap (ref_gap > 0). */
			calc(
				anchor(var(--_l) right) - var(--_gm)
				- max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
			),
			/* container cap */
			min(
				anchor(var(--_c) right),
				calc(anchor(var(--_l) right) - var(--_eg))
			)
		);
	}

	/*
	 * gap-marker narrowing for line-end types.
	 *
	 * The gap-marker inherits top/bottom/left from the shared type rules above,
	 * then overrides right to narrow itself to max(ref_gap, min_size).
	 *
	 * Why this works for visual alignment:
	 *   Between-node markers are centered in the gap, so their 50% point
	 *   (where the dashed line draws) is at gap/2 from each node edge.
	 *   Line-end markers are narrowed to the same max(ref_gap, min_size)
	 *   width, so their 50% point is also at ref_gap/2 from the node edge.
	 *   Result: all marker lines align on the same x-axis across rows.
	 *
	 * In the right property (right-edge coordinate system):
	 *   ref_gap = anchor(--_f right) - anchor(--_s left)
	 *           = (CB_right - first.right) - (CB_right - second.left)
	 *           = second.left - first.right  (positive value)
	 *
	 * All marker right overrides include max(0px, ...) or a 0px term to
	 * prevent the marker from extending past .svedit at screen edges.
	 */

	/* gap-row marker: same-line gaps keep full width; wrapped line-ends mirror gap-trail
	   behavior, filling the inner gap width if space permits, or narrowing to
	   gap-min-size at the screen edges.
	   Outer max(0px, ...) prevents overflow past .svedit at screen edges. */
	.gap-marker.gap-row {
		left: min(
			/* Fallback: start at prev.right (always valid) */
			anchor(var(--_p) right),
			/* Same-line: center between prev and next with min-size guarantee.
			   max(0, prev.right - next.left) * 9999 explodes when wrapped
			   (gap is positive -> huge offset disqualifies this branch via min). */
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--_gm) / 2
				+ max(0px, anchor(var(--_p) right) - anchor(var(--_n) left)) * 9999
			),
			/* Wrapped centering offset: shift right by half ref_gap minus half
			   max(ref_gap, min_size). Aligns the 50% marker line with
			   between-node markers. Explodes if on the same line. */
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
			/* Clamp 1: basic minimum width guarantee at screen edge */
			calc(100% - var(--_gm)),
			/* Clamp 2: enforces ref_gap width, but explodes and gets ignored
			   if space_available < ref_gap OR if on the same line. */
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
			/* Same-line: right at next.left (full width between nodes) */
			anchor(var(--_n) left),
			/* Same-line centering from the right side */
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--_gm) / 2
			),
			/* Wrapped: inner max() picks the most constrained value. */
			max(
				/* Branch 1: normal ref_gap width */
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
				/* Branch 2: snap to gap-min-size if space is tight */
				calc(
					anchor(var(--_p) right) - var(--_gm)
					- max(0px,
						(anchor(var(--_p) right) - anchor(var(--_c) right))
						- (max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)))
						+ 0.5px
					) * 9999
				),
				/* Branch 3: fixed gap-min-size when completely wrapped (ref_gap = 0).
				   Explodes if there is a gap (ref_gap > 0). */
				calc(
					anchor(var(--_p) right) - var(--_gm)
					- max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
				),
				/* Branch 4: explodes (huge positive) if on same line, forcing outer min() to ignore this max() */
				calc(
					anchor(var(--_p) right)
					- (anchor(var(--_n) left) - anchor(var(--_p) right)) * 9999
				),
				/* container cap */
				min(
					anchor(var(--_c) right),
					calc(anchor(var(--_p) right) - var(--_eg))
				)
			)
		));
	}

	/*
	 * gap-marker narrowing for edge gaps.
	 * The hit area remains var(--_eg) wide, but the visual marker
	 * shrinks to var(--_gm) so it stays close to the node.
	 */
	.gap-marker.gap-edge {
		min-height: var(--_gm);
		min-width: var(--_gm);
		&.row.first {
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
			top: max(0px, calc(anchor(var(--_a) top) - var(--_gm)));
		}
		&:not(.row).last {
			bottom: calc(anchor(var(--_a) bottom) - var(--_gm));
		}
	}

	/* Marker visuals (line + symbol). Hidden when active (caret replaces them). */
	.gap-marker:not(.active) {
		/* Shared base for all marker lines. */
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
	.gap {
		outline: 0.1px solid red;
	}
	.gap-marker {
		outline: 0.1px solid blue;
		outline-offset: -2px;
	}
</style>