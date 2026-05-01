/**
 * Gap computation and viewport-aware positioning for node-array
 * insertion markers. Called once from Svedit.svelte during init.
 *
 * @module
 */

import { untrack } from 'svelte';

/**
 * IntersectionObserver-based viewport tracking for node arrays.
 *
 * ## Why this exists
 *
 * CSS anchor positioning is O(N) — the browser must resolve anchor()
 * functions for every positioned element on layout. Gap markers
 * (NodeGapMarkers) also grow at O(N). At ~200+ nodes this causes
 * noticeable frame drops during scroll and resize; at 500+ it's
 * unusable.
 *
 * ## Design principle: structurally stable DOM
 *
 * NodeGap elements are **always present** in the DOM when editable,
 * regardless of viewport position. This guarantees:
 * - Selection anchors survive scrolling (no DOM removal mid-drag)
 * - scrollTo can always target gap elements
 * - ui = f(doc_state, editable_state) — no viewport-driven DOM changes
 *
 * The viewport tracker drives **lazy positioning**: only near-viewport
 * gaps receive CSS anchor positioning (via the `.positioned` class
 * toggled imperatively by the IO callback). Off-viewport gaps remain
 * as zero-size absolute elements with no layout cost. Gap markers
 * (NodeGapMarkers) are only computed for visible indices.
 *
 * ## Architecture
 *
 * ALL node_array children are observed with a single
 * IntersectionObserver, regardless of nesting depth. Per-array
 * visibility is tracked in `index_map` (Map<array_path, Set<child_index>>),
 * so both top-level arrays (e.g. `page.body`) and nested arrays
 * (e.g. `page.body.5.buttons`) cull gap emission uniformly.
 *
 * This matters for **intermediate scroll containers**: when a nested
 * node_array sits inside its own overflow-scroll element (e.g. a
 * horizontally-scrolling row of buttons), children scrolled outside
 * the container must not emit gaps or activate anchor positioning —
 * otherwise out-of-view anchor() resolutions contribute to layout
 * overflow and cause visible shifts.
 *
 * The IntersectionObserver uses the viewport as its root. Intermediate
 * scroll containers naturally clip their descendants, so IO correctly
 * reports children scrolled out of a nested scroller as non-intersecting.
 *
 * The IntersectionObserver is created once and stays alive across
 * document mutations (typing, node insertion, undo/redo). A
 * MutationObserver watches the DOM for added/removed node elements
 * and dynamically registers/unregisters them with the IO. This avoids
 * the cost of tearing down and recreating the IO on every keystroke.
 * The MutationObserver start is deferred by one `requestAnimationFrame`
 * to skip the initial Svelte mount burst (which setup_observation
 * already handles).
 *
 * ## Reactivity strategy
 *
 * `.positioned` class toggling on NodeGap elements is **imperative**:
 * the IO callback directly toggles classes on adjacent gap DOM
 * elements via `toggle_adjacent_gaps()`. This is O(K) where K is
 * the number of nodes whose visibility changed — no reactive fan-out.
 *
 * Gap marker computation (NodeGapMarkers) uses a debounced
 * `gap_version` counter that triggers the `$effect.pre` pipeline.
 * The 20ms debounce coalesces rapid IO callbacks into one rebuild.
 *
 */

/**
 * Overscan margin around the viewport (px). Nodes within this distance
 * of the viewport get anchor positioning activated and gap markers
 * computed. 500px provides enough buffer for fast scrolling (~8000px/s)
 * while adding only 3 extra gap markers vs e.g. 250px — no measurable
 * FPS impact at ≤1000 nodes.
 *
 * Tested values: 250 / 500 / 1000 / 2000. Higher values increase
 * gap marker count and degrade scroll FPS at 6000+ nodes.
 */
const DEFAULT_OVERSCAN_PX = 500;

const NODE_SELECTOR = '[data-type="node"][data-path]';

/**
 * IntersectionObserver callback for view-mode visibility classes.
 * Toggles `in-view`, `fully-in-view`, `visible-top`, `visible-bottom`,
 * and `seen` on observed node elements. Used by both editing and
 * view-only modes for CSS scrollytelling and lazy reveal animations.
 *
 * @param {IntersectionObserverEntry[]} entries
 */
function process_view_entries(entries) {
	for (const entry of entries) {
		const cl = entry.target.classList;
		cl.toggle('in-view', entry.isIntersecting);
		if (entry.isIntersecting) {
			cl.add('seen');
			const bcr = entry.boundingClientRect;
			const ir = entry.intersectionRect;
			cl.toggle('fully-in-view', entry.intersectionRatio > 0.98);
			cl.toggle('visible-top', ir.bottom < bcr.bottom - 0.5);
			cl.toggle('visible-bottom', ir.top > bcr.top + 0.5);
		} else {
			cl.remove('fully-in-view', 'visible-top', 'visible-bottom');
		}
	}
}

/**
 * Debounce before bumping the reactive gap_version after IO visibility
 * changes. Only affects gap MARKER re-computation (the `$effect.pre`
 * pipeline), not `.positioned` class toggling which is imperative and
 * instant. 20ms coalesces rapid IO callbacks into one gap rebuild.
 */
const GAP_DEBOUNCE_MS = 20;

const GAP_SELECTOR = '.node-gap[data-gap-array-path]';

/**
 * Shallow array equality for node ID lists. Reference check first
 * (free), then element-wise comparison. Handles the case where a
 * $state proxy wrapping the Session returns new array wrappers for
 * the same underlying structural-sharing data.
 *
 * @param {any[] | null} a
 * @param {any[] | null} b
 * @returns {boolean}
 */
function node_ids_equal(a, b) {
	if (a === b) return true;
	if (!a || !b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

/**
 * Split "root.prop.0" into { array_path: "root.prop", child_index: 0 }.
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
 * @param {object} svedit
 * @returns {{
 *   readonly visible_child_indices: Map<string, Set<number>>,
 *   readonly doc_snapshot: object | null,
 *   readonly array_ver_map: Map<string, number>,
 *   should_position_gap: (array_path: string, offset: number, is_last: boolean) => boolean
 * }}
 */
function create_visibility_culler(svedit) {

	/** @type {Map<string, Set<number>>} */
	const index_map = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

	/**
	 * Per-node 2-bit clip state: bit 0 = leading (top|left edge clipped),
	 * bit 1 = trailing (bottom|right edge clipped). Used to hide edge
	 * gap-markers when the first/last node has scrolled past its nearest
	 * scroll container's edge (e.g. horizontally-scrolling `.buttons`).
	 *
	 * @type {Map<string, number>}
	 */
	const clip_map = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

	/**
	 * Per-array change counter for the gap cache.
	 * @type {Map<string, number>}
	 */
	const array_ver_map = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

	let _gap_ver = 0;
	let gap_version = $state.raw(0);
	let doc_snapshot = $state.raw(null);
	let gap_version_timer = 0;

	/**
	 * @param {string} array_path_str
	 */
	function bump_array_ver(array_path_str) {
		array_ver_map.set(array_path_str, (array_ver_map.get(array_path_str) ?? 0) + 1);
	}

	/**
	 * Drop map entries for a node element being removed from the DOM.
	 * @param {HTMLElement} el
	 */
	function forget_node(el) {
		const path = el.dataset.path;
		if (!path) return;
		clip_map.delete(path);
		const parsed = parse_node_path(path);
		if (!parsed) return;
		const set = index_map.get(parsed.array_path);
		if (set && set.delete(parsed.child_index) && set.size === 0) {
			index_map.delete(parsed.array_path);
		}
		bump_array_ver(parsed.array_path);
	}

	/**
	 * @param {IntersectionObserverEntry} entry
	 * @returns {number}
	 */
	function compute_clip_bits(entry) {
		if (!entry.isIntersecting) return 0b11;
		const bcr = entry.boundingClientRect;
		const ir = entry.intersectionRect;
		const leading = (ir.top > bcr.top + 0.5 || ir.left > bcr.left + 0.5) ? 0b01 : 0;
		const trailing = (ir.bottom < bcr.bottom - 0.5 || ir.right < bcr.right - 0.5) ? 0b10 : 0;
		return leading | trailing;
	}

	/**
	 * Pure visibility check for a gap. No reactive dependencies.
	 *
	 * @param {string} array_path_str
	 * @param {number} offset
	 * @param {boolean} is_last
	 * @returns {boolean}
	 */
	function should_position_gap(array_path_str, offset, is_last) {
		const set = index_map.get(array_path_str);
		if (offset === 0) {
			if (!set || !set.has(0)) return false;
			return ((clip_map.get(`${array_path_str}.0`) ?? 0) & 0b01) === 0;
		}
		if (is_last) {
			const last = offset - 1;
			if (!set || !set.has(last)) return false;
			return ((clip_map.get(`${array_path_str}.${last}`) ?? 0) & 0b10) === 0;
		}
		return !!set && set.has(offset - 1) && set.has(offset);
	}

	/**
	 * Toggle `.positioned` class on a gap element based on current
	 * index_map / clip_map state. O(1) per gap.
	 *
	 * @param {Element} gap_el
	 */
	function toggle_gap_positioned(gap_el) {
		const arr = /** @type {HTMLElement} */ (gap_el).dataset.gapArrayPath;
		if (!arr) return;
		const offset = parseInt(/** @type {HTMLElement} */ (gap_el).dataset.gapOffset, 10);
		const is_last = gap_el.classList.contains('last');
		gap_el.classList.toggle('positioned', should_position_gap(arr, offset, is_last));
	}

	/**
	 * Toggle `.positioned` on both gap elements adjacent to a node.
	 * @param {Element} node_el
	 */
	function toggle_adjacent_gaps(node_el) {
		const prev = node_el.previousElementSibling;
		if (prev?.classList.contains('node-gap')) toggle_gap_positioned(prev);
		const next = node_el.nextElementSibling;
		if (next?.classList.contains('node-gap')) toggle_gap_positioned(next);
	}

	/**
	 * IO callback. Updates index_map + clip_map, then imperatively
	 * toggles `.positioned` on adjacent gap DOM elements. Debounces
	 * a gap_version bump for the gap marker pipeline.
	 *
	 * @param {IntersectionObserverEntry[]} entries
	 */
	function process_entries(entries) {
		let did_change = false;
		for (const entry of entries) {
			const el = /** @type {HTMLElement} */ (entry.target);
			const path = el.dataset.path;
			if (!path) continue;
			const parsed = parse_node_path(path);
			if (!parsed) continue;

			let array_changed = false;

			if (entry.isIntersecting) {
				let set = index_map.get(parsed.array_path);
				if (!set) index_map.set(parsed.array_path, set = new Set()); // eslint-disable-line svelte/prefer-svelte-reactivity
				if (!set.has(parsed.child_index)) {
					set.add(parsed.child_index);
					array_changed = true;
				}
			} else {
				const set = index_map.get(parsed.array_path);
				if (set && set.delete(parsed.child_index)) {
					array_changed = true;
					if (set.size === 0) index_map.delete(parsed.array_path);
				}
			}

			const new_bits = compute_clip_bits(entry);
			const old_bits = clip_map.get(path) ?? 0;
			if (new_bits !== old_bits) {
				if (new_bits === 0 || new_bits === 0b11) clip_map.delete(path);
				else clip_map.set(path, new_bits);
				const old_meaningful = old_bits === 0b01 || old_bits === 0b10;
				const new_meaningful = new_bits === 0b01 || new_bits === 0b10;
				if (old_meaningful || new_meaningful) array_changed = true;
			}

			if (array_changed) {
				bump_array_ver(parsed.array_path);
				did_change = true;
				toggle_adjacent_gaps(el);
			}
		}
		if (did_change) {
			clearTimeout(gap_version_timer);
			gap_version_timer = window.setTimeout(() => {
				gap_version = ++_gap_ver;
				doc_snapshot = svedit.session.doc;
			}, GAP_DEBOUNCE_MS);
		}
	}

	/**
	 * Observe all existing nodes, populate index_map synchronously
	 * via gBCR, then toggle `.positioned` on all gap elements.
	 *
	 * Two-pass: first pass populates index_map for all visible nodes
	 * so the second pass has complete neighbor information when
	 * computing should_position_gap for each gap.
	 *
	 * @param {IntersectionObserver} io
	 */
	function setup_observation(io) {
		const vh = window.innerHeight;
		const vw = window.innerWidth;

		for (const el of document.querySelectorAll(NODE_SELECTOR)) {
			const node_el = /** @type {HTMLElement} */ (el);
			const path = node_el.dataset.path;
			if (!path) continue;
			io.observe(node_el);
			const parsed = parse_node_path(path);
			if (!parsed) continue;
			const rect = node_el.getBoundingClientRect();
			if (rect.top <= vh + DEFAULT_OVERSCAN_PX &&
				rect.bottom >= -DEFAULT_OVERSCAN_PX &&
				rect.right >= -DEFAULT_OVERSCAN_PX &&
				rect.left <= vw + DEFAULT_OVERSCAN_PX) {
				let set = index_map.get(parsed.array_path);
				if (!set) index_map.set(parsed.array_path, set = new Set()); // eslint-disable-line svelte/prefer-svelte-reactivity
				set.add(parsed.child_index);
				bump_array_ver(parsed.array_path);
			}
		}

		for (const el of document.querySelectorAll(GAP_SELECTOR)) {
			toggle_gap_positioned(el);
		}
	}

	$effect(() => {
		if (!svedit.editable) {
			index_map.clear();
			clip_map.clear();
			array_ver_map.clear();
			gap_version = ++_gap_ver;
			doc_snapshot = null;
			return;
		}

		index_map.clear();
		clip_map.clear();
		array_ver_map.clear();

		const io = new IntersectionObserver(process_entries, {
			rootMargin: `${DEFAULT_OVERSCAN_PX}px`,
			threshold: [0, 1]
		});

		setup_observation(io);
		doc_snapshot = untrack(() => svedit.session.doc);
		gap_version = ++_gap_ver;

		const canvas = untrack(() => svedit.canvas_el) || document.querySelector('.svedit-canvas');
		/** @type {MutationObserver | null} */
		let mo = null;
		let deferred_raf = 0;

		if (canvas) {
			mo = new MutationObserver((mutations) => {
				const vh = window.innerHeight;
				const vw = window.innerWidth;
				let any_added = false;

				// Pass 1: process node additions/removals → update index_map
				for (const m of mutations) {
					for (const added of m.addedNodes) {
						if (added.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (added);
						if (el.matches?.(NODE_SELECTOR)) {
							io.observe(el);
							if (sync_add_node(el, vh, vw)) any_added = true;
						}
						for (const child of el.querySelectorAll?.(NODE_SELECTOR) ?? []) {
							io.observe(/** @type {HTMLElement} */ (child));
							if (sync_add_node(/** @type {HTMLElement} */ (child), vh, vw)) any_added = true;
						}
					}
					for (const removed of m.removedNodes) {
						if (removed.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (removed);
						if (el.matches?.(NODE_SELECTOR)) forget_node(el);
						for (const child of el.querySelectorAll?.(NODE_SELECTOR) ?? []) {
							forget_node(/** @type {HTMLElement} */ (child));
						}
					}
				}

				// Pass 2: toggle .positioned on new/re-keyed gap elements
				for (const m of mutations) {
					for (const added of m.addedNodes) {
						if (added.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (added);
						if (el.matches?.(GAP_SELECTOR)) toggle_gap_positioned(el);
						for (const child of el.querySelectorAll?.(GAP_SELECTOR) ?? []) {
							toggle_gap_positioned(child);
						}
					}
				}

				if (any_added) {
					clearTimeout(gap_version_timer);
					gap_version = ++_gap_ver;
					doc_snapshot = svedit.session.doc;
				}
			});
			deferred_raf = requestAnimationFrame(() => {
				mo.observe(canvas, { childList: true, subtree: true });
			});
		}

		return () => {
			clearTimeout(gap_version_timer);
			cancelAnimationFrame(deferred_raf);
			io.disconnect();
			mo?.disconnect();
			index_map.clear();
			clip_map.clear();
			array_ver_map.clear();
		};
	});

	/**
	 * Sync-add a node to index_map if it's within the overscan zone.
	 * Used by the MO for dynamically added nodes.
	 *
	 * @param {HTMLElement} el
	 * @param {number} vh
	 * @param {number} vw
	 * @returns {boolean}
	 */
	function sync_add_node(el, vh, vw) {
		const path = el.dataset.path;
		if (!path) return false;
		const parsed = parse_node_path(path);
		if (!parsed) return false;
		const rect = el.getBoundingClientRect();
		if (rect.top > vh + DEFAULT_OVERSCAN_PX ||
			rect.bottom < -DEFAULT_OVERSCAN_PX ||
			rect.right < -DEFAULT_OVERSCAN_PX ||
			rect.left > vw + DEFAULT_OVERSCAN_PX) return false;
		let set = index_map.get(parsed.array_path);
		if (!set) index_map.set(parsed.array_path, set = new Set()); // eslint-disable-line svelte/prefer-svelte-reactivity
		if (set.has(parsed.child_index)) return false;
		set.add(parsed.child_index);
		bump_array_ver(parsed.array_path);
		return true;
	}

	// Reactive bridge: ensures gap marker rebuild on structural doc changes
	$effect.pre(() => {
		doc_snapshot = svedit.session.doc;
	});

	/*
	 * View-mode visibility classes (always active, editing + viewing).
	 * Toggles `in-view` / `fully-in-view` / `visible-top` /
	 * `visible-bottom` / `seen` imperatively from the IO callback.
	 */
	$effect(() => {
		if (typeof window === 'undefined') return;

		const view_io = new IntersectionObserver(process_view_entries, { threshold: [0, 1] });

		for (const el of document.querySelectorAll(NODE_SELECTOR)) {
			const node_el = /** @type {HTMLElement} */ (el);
			if (node_el.dataset.path) view_io.observe(node_el);
		}

		const canvas = untrack(() => svedit.canvas_el) || document.querySelector('.svedit-canvas');
		/** @type {MutationObserver | null} */
		let mo = null;
		let deferred_raf = 0;
		if (canvas) {
			mo = new MutationObserver((mutations) => {
				for (const m of mutations) {
					for (const added of m.addedNodes) {
						if (added.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (added);
						if (el.matches?.(NODE_SELECTOR)) view_io.observe(el);
						for (const child of el.querySelectorAll?.(NODE_SELECTOR) ?? []) {
							view_io.observe(/** @type {HTMLElement} */ (child));
						}
					}
				}
			});
			deferred_raf = requestAnimationFrame(() => {
				mo.observe(canvas, { childList: true, subtree: true });
			});
		}

		return () => {
			cancelAnimationFrame(deferred_raf);
			view_io.disconnect();
			mo?.disconnect();
		};
	});

	return {
		get visible_child_indices() { gap_version; return index_map; },
		get doc_snapshot() { return doc_snapshot; },
		get array_ver_map() { return array_ver_map; },
		should_position_gap
	};
}

/* --------------------------------------------------------------------- */
/* Gap computation                                                       */
/* --------------------------------------------------------------------- */

/**
 * @param {object} svedit - Svedit context (session, editable, doc, schema, etc.)
 */
export function create_gap_computation(svedit) {
	const culler = create_visibility_culler(svedit);

	svedit.should_position_gap = culler.should_position_gap;

	/**
	 * Per-array gap cache. Two-level cache keyed by array_path_str:
	 *
	 * - Fast hit: `ver` and `doc` both match → return cached gaps without
	 *   any session calls. Hot path during pure scroll (no doc mutations).
	 * - Medium hit: `ver` matches but `doc` differs, and `node_ids` ref is
	 *   stable → array wasn't affected by the doc mutation (e.g. user typed
	 *   in an unrelated node). Reuse cached gaps and promote the doc ref for
	 *   a fast hit next tick.
	 *
	 * @type {Map<string, { ver: number, doc: any, node_ids: any, gaps: Array<gap_t> }>}
	 */
	const gap_cache = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

	$effect(() => {
		if (!svedit.editable) gap_cache.clear();
	});

	let caret_gap_key = $derived.by(() => {
		const s = svedit.session.selection;
		if (s?.type !== 'node' || s.anchor_offset !== s.focus_offset) return null;
		return `${s.path.join('.')}-gap-${s.anchor_offset}`;
	});

	/**
	 * Per-path reactive gap data. Each NodeGapMarkers instance
	 * subscribes to its own PathGapData signal, so when gaps change
	 * only the ~10-15 affected paths re-render — O(K) not O(M=1200).
	 */
	class PathGapData {
		gaps = $state.raw([]);
	}

	/** @type {Map<string, PathGapData>} */
	const path_gap_signals = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

	/**
	 * @param {string} path_str
	 * @returns {PathGapData}
	 */
	function get_or_create_gap_signal(path_str) {
		let sig = path_gap_signals.get(path_str);
		if (!sig) {
			sig = new PathGapData();
			path_gap_signals.set(path_str, sig);
		}
		return sig;
	}

	/**
	 * Previous tick's gap output, reused as a "keys-that-were-visible-last-time"
	 * set. On each tick we only need to clear signals that disappeared — iterating
	 * path_gap_signals directly would be O(all_signals_ever_created).
	 *
	 * @type {Map<string, Array<gap_t>>}
	 */
	let prev_gaps_map = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

	/**
	 * Shallow structural equality on two gap_t arrays. When the gap cache
	 * misses (e.g. IO bumped array_ver without changing visible indices),
	 * emit_gaps produces a NEW array whose contents are identical to the
	 * cached one. Reassigning a new ref to `sig.gaps` would needlessly
	 * re-render NodeGapMarkers and re-evaluate `positioned` $deriveds —
	 * the root cause of per-keystroke anchor flicker at scale.
	 *
	 * @param {Array<gap_t>} a
	 * @param {Array<gap_t>} b
	 */
	function gaps_equal(a, b) {
		if (a === b) return true;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			const x = a[i], y = b[i];
			if (x.key !== y.key || x.vars !== y.vars || x.type !== y.type ||
				x.offset !== y.offset || x.is_first !== y.is_first ||
				x.is_last !== y.is_last || x.has_pair !== y.has_pair) return false;
		}
		return true;
	}

	// Distribute gap data to per-path signals. Runs before DOM updates
	// so NodeGapMarkers sees fresh data in the same render pass.
	//
	// Two-level skip to avoid downstream re-renders:
	// 1. The gap cache returns the same array reference when an array's
	//    state is unchanged, so `sig.gaps !== gaps` short-circuits the
	//    $state.raw assignment — $derived consumers don't re-evaluate.
	// 2. Stale clear iterates only paths that WERE visible last tick,
	//    not every signal ever created.
	$effect.pre(() => {
		const new_gaps = build_all_gaps();
		for (const [path_str, gaps] of new_gaps) {
			const sig = get_or_create_gap_signal(path_str);
			if (sig.gaps !== gaps && !gaps_equal(sig.gaps, gaps)) {
				sig.gaps = gaps;
			}
		}
		for (const [path_str] of prev_gaps_map) {
			if (!new_gaps.has(path_str)) {
				const sig = path_gap_signals.get(path_str);
				if (sig && sig.gaps.length > 0) sig.gaps = [];
			}
		}
		prev_gaps_map = new_gaps;
	});

	svedit.insertion_gap_data = {
		get_gaps: get_or_create_gap_signal,
		get caret_gap_key() { return caret_gap_key; }
	};

	// -----------------------------------------------------------------------------
	// gap building
	// -----------------------------------------------------------------------------

	/**
	 * @typedef {{
	 *   key: string,
	 *   path: Array<string|number>,
	 *   offset: number,
	 *   type: string,
	 *   vars: string,
	 *   is_first: boolean,
	 *   is_last: boolean,
	 *   has_pair: boolean
	 * }} gap_t
	 */

	/**
	 * @returns {Map<string, Array<gap_t>>}
	 */
	function build_all_gaps() {
		if (!svedit.editable) return new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

		/** @type {Map<string, Array<gap_t>>} */
		const by_path = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

		// Wait until the culler's visibility snapshot matches the current
		// doc. During the brief gap between a doc mutation and the next IO
		// callback, the snapshot is stale — emitting gap-markers now would
		// produce entries referencing node paths that may have just been
		// removed, and their anchor() references fall back to the containing
		// block → huge gap-markers spanning the whole container. Returning
		// empty blanks markers for one frame but avoids the far worse
		// overlapping-giant-gaps regression. The IO fires within one frame.
		if (culler.doc_snapshot !== svedit.session.doc) return by_path;

		// Build culled gaps uniformly for every array that has visible
		// children (root-level and nested alike). Empty arrays are covered
		// because NodeArrayProperty renders an `.empty-node-array`
		// placeholder with `data-type="node"`, which IO observes like any
		// other node — when visible, the array appears in index_map with
		// child_index 0, and `build_array_gaps_culled` dispatches to the
		// count===0 branch of `emit_gaps`.
		for (const path_str of culler.visible_child_indices.keys()) {
			const gaps = build_array_gaps_culled(path_str);
			if (gaps.length > 0) by_path.set(path_str, gaps);
		}

		return by_path;
	}

	/**
	 * Build gaps for a node_array using visibility filter (culled path).
	 * See `gap_cache` for the two-level skip strategy.
	 *
	 * @param {string} array_path_str
	 * @returns {Array<gap_t>}
	 */
	function build_array_gaps_culled(array_path_str) {
		const current_ver = culler.array_ver_map.get(array_path_str) ?? 0;
		const current_doc = svedit.session.doc;
		const cached = gap_cache.get(array_path_str);

		// Fast hit: no IO change and same doc → no session calls needed.
		if (cached && cached.ver === current_ver && cached.doc === current_doc) {
			return cached.gaps;
		}

		const array_path = array_path_str.split('.');
		let node_ids = null;
		try {
			const info = svedit.session.inspect(array_path);
			if (info.kind === 'property' && info.type === 'node_array') {
				const n = svedit.session.get(array_path);
				if (Array.isArray(n)) node_ids = n;
			}
		} catch { /* invalid path — cache the empty result below */ }

		if (!node_ids) {
			gap_cache.set(array_path_str, { ver: current_ver, doc: current_doc, node_ids: null, gaps: [] });
			return [];
		}

		// Medium hit: doc changed but this array's node_ids are unchanged
		// (common case: user typed in an unrelated node and apply_op left
		// this array's containing node untouched). Reuse gaps and promote
		// the doc ref so next tick takes the fast hit.
		//
		// First try reference equality (free, works with raw Session),
		// then fall back to content comparison (handles $state proxy
		// wrapping where structural sharing is obscured by new proxy
		// wrappers on each doc mutation).
		if (cached && cached.ver === current_ver && node_ids_equal(cached.node_ids, node_ids)) {
			cached.doc = current_doc;
			cached.node_ids = node_ids;
			return cached.gaps;
		}

		const gaps = emit_gaps(array_path_str, array_path, node_ids.length, (offset, count) =>
			culler.should_position_gap(array_path_str, offset, offset === count)
		);

		gap_cache.set(array_path_str, { ver: current_ver, doc: current_doc, node_ids, gaps });
		return gaps;
	}

	/**
	 * Core gap emitter.
	 * @param {string} array_path_str
	 * @param {Array<string|number>} array_path
	 * @param {number} count
	 * @param {(offset: number, count: number) => boolean} is_visible
	 * @returns {Array<gap_t>}
	 */
	function emit_gaps(array_path_str, array_path, count, is_visible) {
		const anchor_prefix = `--${array_path.join('-')}`;
		const g_prefix = `--g-${array_path.join('-')}`;
		const container_var = `;--_c:${anchor_prefix}`;
		const has_pair = count >= 2;
		const pair_vars = has_pair
			? `;--_f:${anchor_prefix}-0;--_s:${anchor_prefix}-1`
			: '';

		/** @type {Array<gap_t>} */
		const gaps = [];

		if (count === 0) {
			gaps.push({
				key: `${array_path_str}-gap-0`,
				path: array_path,
				offset: 0,
				type: 'gap-empty',
				vars: `--_ct:${g_prefix}-0-gap-before;--_a:${anchor_prefix}-0${container_var}`,
				is_first: true,
				is_last: true,
				has_pair: false
			});
			return gaps;
		}

		for (let offset = 0; offset <= count; offset++) {
			if (!is_visible(offset, count)) continue;

			const is_first = offset === 0;
			const is_last = offset === count;
			const g_anchor = offset === 0
				? `${g_prefix}-0-gap-before`
				: `${g_prefix}-${offset - 1}-gap-after`;

			let type, vars;

			if (is_first || is_last) {
				type = 'gap-edge';
				const adjacent = is_first
					? `${anchor_prefix}-0`
					: `${anchor_prefix}-${count - 1}`;
				vars = `--_ct:${g_anchor};--_a:${adjacent}${container_var}${pair_vars}`;
			} else {
				type = 'gap-mid';
				const p_anchor = `${anchor_prefix}-${offset - 1}`;
				const n_anchor = `${anchor_prefix}-${offset}`;
				vars = `--_ct:${g_anchor};--_p:${p_anchor};--_n:${n_anchor}${container_var}${pair_vars}`;
			}

			gaps.push({
				key: `${array_path_str}-gap-${offset}`,
				path: array_path,
				offset,
				type,
				vars,
				is_first,
				is_last,
				has_pair
			});
		}

		return gaps;
	}
}
