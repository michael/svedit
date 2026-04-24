/**
 * Gap computation and viewport-aware positioning for node-array
 * insertion markers. Called once from Svedit.svelte during init.
 *
 * @module
 */

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
 * gaps receive CSS anchor positioning (via NodeGap's `positioned`
 * prop). Off-viewport gaps remain as zero-size absolute elements with
 * no layout cost. Gap markers (NodeGapMarkers) are only computed for
 * visible indices.
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
 * A single debounced **version counter** drives both node gap
 * positioning (`is_near_viewport`) and gap marker computation
 * (`visible_child_indices`). `is_near_viewport` reads `version`
 * (reactive dependency) then does a non-reactive `Map.get` +
 * `Set.has` lookup on `index_map`.
 *
 * The 20ms debounce coalesces rapid IO callbacks into a single reactive
 * version bump, preventing redundant O(N) `$derived` re-evaluations
 * (~53ms total overlay latency ≈ 3 frames at 60fps). On initial mount,
 * the `$effect` bumps `version` immediately (no debounce); Svelte
 * flushes effects before the first browser paint so overlays appear
 * with zero flash.
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
 * Debounce before bumping the reactive `version` after IO visibility
 * changes. 20ms coalesces rapid IO callbacks into one version bump,
 * yielding consistent 60fps at ≤1000 nodes. Total perceived overlay
 * latency is ~53ms (IO callback + 20ms + render ≈ 3 frames), well
 * below the ~60ms threshold where delays become noticeable.
 *
 * Tested values: 0 / 5 / 10 / 20. Lower values (0–10) cause FPS
 * drops at 1000 nodes (37–55fps avg vs 60fps with 20ms).
 */
const VERSION_DEBOUNCE_MS = 20;

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
 *   is_near_viewport: (path: Array<string|number>) => boolean,
 *   should_position_gap: (array_path: Array<string|number>, offset: number, count: number) => boolean
 * }}
 */
function create_visibility_culler(svedit) {

	/** @type {Map<string, Set<number>>} */
	const index_map = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

	/**
	 * Per-node 2-bit clip state: bit 0 = leading (top|left edge clipped),
	 * bit 1 = trailing (bottom|right edge clipped). Derived from
	 * entry.intersectionRect vs entry.boundingClientRect — the IO spec
	 * guarantees intersectionRect already accounts for ancestor
	 * scroll-container clipping, so no extra observers or per-frame
	 * measurements are needed. Used to hide edge gap-markers when the
	 * first/last node has scrolled past its nearest scroll container's
	 * edge (e.g. Story.svelte horizontally-scrolling `.buttons`).
	 *
	 * Axis-agnostic on purpose: JS doesn't cheaply know the layout's
	 * row/column orientation, so "leading" OR's top+left and "trailing"
	 * OR's bottom+right. Cross-axis clip (e.g. a row scroller whose
	 * items exceed container height) may over-hide — accepted trade-off.
	 *
	 * @type {Map<string, number>}
	 */
	const clip_map = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

	/**
	 * Per-array change counter. Bumps whenever this array's IO visibility
	 * or clip state changes. Consumed by the gap cache (create_gap_computation)
	 * to skip rebuilding arrays whose state is unchanged since the last
	 * version bump — turns O(all_visible_arrays) into O(changed_arrays) on
	 * every scroll tick.
	 *
	 * @type {Map<string, number>}
	 */
	const array_ver_map = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

	let _ver = 0;
	let version = $state.raw(0);
	let doc_snapshot = $state.raw(null);
	let version_timer = 0;

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
	 * Returns 2 bits: bit 0 = leading clipped (top|left), bit 1 = trailing
	 * clipped (bottom|right). 0.5px tolerance avoids subpixel false
	 * positives. Both bits set when fully hidden.
	 *
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
	 * Shared IntersectionObserver callback. Mutates index_map and
	 * clip_map in place, then debounces the reactive version bump.
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
				// 0b11 (fully hidden) is equivalent to "not tracked" for
				// consumers — should_position_gap short-circuits on the
				// visibility set before ever reading clip bits. Dropping
				// the entry keeps clip_map size proportional to partially-
				// clipped nodes, not total observed nodes.
				if (new_bits === 0 || new_bits === 0b11) clip_map.delete(path);
				else clip_map.set(path, new_bits);
				// Only bump when the transition is observable to consumers.
				// 0 ↔ 0b11 transitions are invisible (both drop from clip_map),
				// and should_position_gap already reacts to visibility-set
				// changes handled above. Bumping here would spuriously
				// invalidate the gap cache on every IO refire for off-screen
				// nodes, causing per-keystroke gap reassignment at scale.
				const old_meaningful = old_bits === 0b01 || old_bits === 0b10;
				const new_meaningful = new_bits === 0b01 || new_bits === 0b10;
				if (old_meaningful || new_meaningful) array_changed = true;
			}

			if (array_changed) {
				bump_array_ver(parsed.array_path);
				did_change = true;
			}
		}
		if (did_change) {
			clearTimeout(version_timer);
			version_timer = window.setTimeout(() => {
				version = ++_ver;
				doc_snapshot = svedit.session.doc;
			}, VERSION_DEBOUNCE_MS);
		}
	}

	/**
	 * Synchronous visibility check used when a node is first registered —
	 * either during `setup_observation` at mount, or via the MutationObserver
	 * when a new node enters the DOM. IO's initial callback is async; without
	 * this, newly-mounted visible nodes are absent from `index_map` for up to
	 * a frame, during which `build_all_gaps` omits their gap markers. In
	 * wrapping layouts (grid / flex-wrap) that window is visible to the user
	 * as missing markers until the next IO tick.
	 *
	 * @param {HTMLElement} node_el
	 * @param {number} vh
	 * @param {number} vw
	 * @returns {boolean} true when the node was added to index_map
	 */
	function sync_add_if_visible(node_el, vh, vw) {
		const path = node_el.dataset.path;
		if (!path) return false;
		const parsed = parse_node_path(path);
		if (!parsed) return false;
		const rect = node_el.getBoundingClientRect();
		const visible =
			rect.top <= vh + DEFAULT_OVERSCAN_PX &&
			rect.bottom >= -DEFAULT_OVERSCAN_PX &&
			rect.right >= -DEFAULT_OVERSCAN_PX &&
			rect.left <= vw + DEFAULT_OVERSCAN_PX;
		if (!visible) return false;
		let set = index_map.get(parsed.array_path);
		if (!set) index_map.set(parsed.array_path, set = new Set()); // eslint-disable-line svelte/prefer-svelte-reactivity
		if (set.has(parsed.child_index)) return false;
		set.add(parsed.child_index);
		bump_array_ver(parsed.array_path);
		return true;
	}

	/**
	 * Query existing DOM nodes, observe all of them with the IO, and
	 * sync-check each node's visibility for instant initial state.
	 *
	 * Without the sync check, non-intersecting nodes render with
	 * `.positioned=false` on first paint, then flip to true when the IO
	 * callback arrives — visible as a flash of the anchor-positioned gap
	 * marker. The gBCR call per node is cheap at mount because layout
	 * already happened; no additional reflow is triggered.
	 *
	 * @param {IntersectionObserver} io
	 */
	function setup_observation(io) {
		const vh = window.innerHeight;
		const vw = window.innerWidth;

		for (const el of document.querySelectorAll(NODE_SELECTOR)) {
			const node_el = /** @type {HTMLElement} */ (el);
			if (!node_el.dataset.path) continue;
			io.observe(node_el);
			sync_add_if_visible(node_el, vh, vw);
		}
	}

	// Uses $effect (not $effect.pre) because setup_observation needs the
	// DOM to be in the live document (querySelectorAll). Svelte flushes
	// effects before the first browser paint, so the immediate version
	// bump here makes overlays appear with zero flash.
	//
	// Depends only on `svedit.editable`, NOT `svedit.session.doc`. The IO
	// stays alive across document mutations. A MutationObserver registers
	// newly added DOM nodes; removals are handled by the IO itself.
	$effect(() => {
		if (!svedit.editable) {
			index_map.clear();
			clip_map.clear();
			array_ver_map.clear();
			version = ++_ver;
			doc_snapshot = null;
			return;
		}

		index_map.clear();
		clip_map.clear();
		array_ver_map.clear();

		// threshold 1 fires on fully-visible ↔ partially-clipped transitions
		// (the signal compute_clip_bits needs); threshold 0 fires on
		// partially-visible ↔ hidden. Without threshold 1, a node scrolled
		// from fully-visible to partially-clipped inside a nested scroller
		// would never fire again and clip_map would go stale.
		const io = new IntersectionObserver(process_entries, {
			rootMargin: `${DEFAULT_OVERSCAN_PX}px`,
			threshold: [0, 1]
		});

		setup_observation(io);
		// Sync doc_snapshot here — the $effect.pre bridge (line ~309) won't
		// re-run because doc didn't change, only editable did.
		doc_snapshot = svedit.session.doc;
		version = ++_ver;

		const canvas = svedit.canvas_el || document.querySelector('.svedit-canvas');
		/** @type {MutationObserver | null} */
		let mo = null;

		// The MO start is deferred by one rAF. During initial Svelte mount,
		// hundreds of DOM mutations fire as components render. Processing
		// these is wasted work since setup_observation() already handled
		// the initial scan. Deferring lets the mount complete first.
		let deferred_raf = 0;

		if (canvas) {
			mo = new MutationObserver((mutations) => {
				const vh = window.innerHeight;
				const vw = window.innerWidth;
				let any_sync_added = false;
				for (const m of mutations) {
					for (const added of m.addedNodes) {
						if (added.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (added);
						if (el.matches?.(NODE_SELECTOR)) {
							io.observe(el);
							if (sync_add_if_visible(el, vh, vw)) any_sync_added = true;
						}
						for (const child of el.querySelectorAll?.(NODE_SELECTOR) ?? []) {
							const child_el = /** @type {HTMLElement} */ (child);
							io.observe(child_el);
							if (sync_add_if_visible(child_el, vh, vw)) any_sync_added = true;
						}
					}
					// Browser auto-unobserves removed elements from the IO, but
					// clip_map/index_map entries keyed by data-path are never
					// cleaned by the IO callback (no exit fires for removed DOM).
					// Without this, both maps grow unbounded across doc mutations.
					for (const removed of m.removedNodes) {
						if (removed.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (removed);
						if (el.matches?.(NODE_SELECTOR)) forget_node(el);
						for (const child of el.querySelectorAll?.(NODE_SELECTOR) ?? []) {
							forget_node(/** @type {HTMLElement} */ (child));
						}
					}
				}
				// New visible nodes added synchronously — bump version now so
				// consumers (NodeArrayProperty, emit_gaps via $effect.pre) see
				// the updated index_map in the same flush. Without this, gaps
				// for the new nodes wait on the IO debounce (~20ms) while
				// NodeGap's positioned prop already reports them visible from
				// the non-reactive index_map read, producing a mismatch where
				// NodeGaps render positioned but NodeGapMarkers don't emit.
				if (any_sync_added) {
					clearTimeout(version_timer);
					version = ++_ver;
					doc_snapshot = svedit.session.doc;
				}
			});
			deferred_raf = requestAnimationFrame(() => {
				mo.observe(canvas, { childList: true, subtree: true });
			});
		}

		return () => {
			clearTimeout(version_timer);
			cancelAnimationFrame(deferred_raf);
			io.disconnect();
			mo?.disconnect();
			index_map.clear();
			clip_map.clear();
			array_ver_map.clear();
		};
	});

	// Reactive bridge: ensures gap-building re-runs on structural doc
	// changes (node add/delete) even when the IO doesn't fire — e.g.
	// removed DOM elements silently leave the IntersectionObserver
	// without an exit callback, so version never bumps for deletions.
	$effect.pre(() => {
		doc_snapshot = svedit.session.doc;
	});

	/**
	 * Viewport proximity check driving lazy anchor positioning.
	 * NodeGap elements are always in the DOM; this determines whether
	 * the expensive CSS anchor positioning is activated (positioned
	 * prop). Reads `version` (debounced 20ms) then does a non-reactive
	 * Map.get + Set.has lookup. On initial mount, version is bumped
	 * immediately (no debounce) so overlays appear in the first paint.
	 *
	 * Per-array visibility: `path` is the child node path (e.g.
	 * ['page', 'body', 3] or ['page', 'body', 5, 'buttons', 2]). We
	 * split off the last segment as the child_index and look up the
	 * array_path's visible set. If no set exists for that array,
	 * none of its children are near the viewport.
	 *
	 * @param {Array<string|number>} path
	 * @returns {boolean}
	 */
	function is_near_viewport(path) {
		void version;
		if (path.length < 2) return true;
		const child_index = path[path.length - 1];
		if (typeof child_index !== 'number') return true;
		const set = index_map.get(path.slice(0, -1).join('.'));
		return set ? set.has(child_index) : false;
	}

	/**
	 * Single source of truth for "should this gap be positioned / emitted".
	 * Between-gaps need BOTH neighbors near-viewport (otherwise the gap
	 * floats over out-of-view space); edge gaps need their one neighbor
	 * near-viewport AND not clipped on the adjacent edge (otherwise the
	 * gap renders outside the nearest scroll container's visible clip).
	 *
	 * Hot path: called N+1 times per visible array from
	 * build_array_gaps_culled AND once per NodeGap from NodeArrayProperty.
	 * Accepts `array_path` as either a pre-joined string (preferred by
	 * callers that already have it) or an array (joined once internally).
	 * Doing the join once here avoids the per-index array spread + join
	 * pattern that would otherwise allocate on every call.
	 *
	 * @param {Array<string|number> | string} array_path
	 * @param {number} offset
	 * @param {number} count
	 * @returns {boolean}
	 */
	function should_position_gap(array_path, offset, count) {
		void version;
		const array_path_str = typeof array_path === 'string'
			? array_path
			: array_path.join('.');
		const set = index_map.get(array_path_str);

		if (offset === 0) {
			if (!set || !set.has(0)) return false;
			return ((clip_map.get(`${array_path_str}.0`) ?? 0) & 0b01) === 0;
		}
		if (offset === count) {
			const last = count - 1;
			if (!set || !set.has(last)) return false;
			return ((clip_map.get(`${array_path_str}.${last}`) ?? 0) & 0b10) === 0;
		}
		return !!set && set.has(offset - 1) && set.has(offset);
	}

	return {
		get visible_child_indices() { version; return index_map; },
		get doc_snapshot() { return doc_snapshot; },
		get array_ver_map() { return array_ver_map; },
		is_near_viewport,
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

	svedit.is_near_viewport = culler.is_near_viewport;
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
		if (!svedit.editable) return new Map();

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
			culler.should_position_gap(array_path_str, offset, count)
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
