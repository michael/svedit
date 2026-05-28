/**
 * Dual-observer viewport visibility tracking for node arrays.
 *
 * ## Why this exists
 *
 * CSS anchor positioning is O(N) — the browser must resolve anchor()
 * functions for every positioned element on every layout pass. Gap
 * markers (NodeGapMarkers) also grow at O(N). At ~200+ nodes this
 * causes frame drops during scroll/resize; at 500+ it's unusable.
 *
 * ## Design principle: structurally stable DOM
 *
 * NodeGap elements are always present in the DOM when editable. The
 * `.positioned` class (which activates anchor() resolution) is gated
 * by viewport visibility. Off-screen NodeGaps remain as zero-size
 * absolute elements with no anchor cost.
 *
 * ## Two observers + a scroll listener
 *
 * **Overscan IO** (`rootMargin: 500px`, threshold `[0, 1]`) — fills
 * `near_map` and per-array `array_indices`. Drives `.positioned`
 * activation on adjacent gaps via `sync_gaps_around_node`.
 *
 * **Viewport IO** (`rootMargin: 0`, threshold `[0, 1]`) — toggles
 * view classes (`.in-view`, `.fully-in-view`, …) on node elements.
 * OPT-IN via `session.config.view_classes`. A separate observer is
 * required because the overscan IO fires its thresholds while nodes
 * are still 500px outside the real viewport.
 *
 * **Document scroll listener** (capture, passive) — fills `edge_map`,
 * a per-array `{first, last}` flag indicating whether the leading/
 * trailing node has reached the matching container edge within
 * EDGE_TOLERANCE_PX. IntersectionObserver doesn't re-fire on scrolls
 * inside non-root scroll containers (the intersection ratio doesn't
 * cross any threshold), so this is the only reliable way to track
 * horizontal-overflow scroll position. The handler is hot but cheap:
 * a single `.closest()` early-out (page scroll → null → returns
 * immediately) and a RAF flush that reads only scrollLeft / scrollWidth /
 * clientWidth on the dirty array.
 *
 * ## Reactivity
 *
 * State lives in SvelteMap (near_map, edge_map) and per-array SvelteSet
 * (array_indices). Consumers (NodeGap via sync_gap_class, NodeGapMarkers
 * via $derived) read via .has()/.get() — Svelte's runtime tracks at
 * per-key granularity, so only consumers whose specific dependencies
 * changed re-evaluate.
 *
 * View classes are toggled imperatively (no Svelte consumers — they're
 * pure CSS hooks for app code).
 *
 * @module
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { untrack } from 'svelte';
import { PATH_SEPARATOR } from './utils.js';

const NODE_SELECTOR = '[data-type="node"][data-path]';
const GAP_SELECTOR = '.node-gap[data-gap-array-path]';

/**
 * Overscan margin around the viewport (px). Nodes within this distance
 * of the viewport get anchor positioning activated and gap markers
 * computed. 500px provides enough buffer for fast scrolling without
 * a measurable FPS hit.
 */
const OVERSCAN_PX = 500;

/**
 * Distance (in CSS pixels) the leading/trailing edge of an edge node is
 * allowed to overshoot the array container's matching edge while still
 * counting as "at the edge". Picks up small overflow from sub-pixel
 * layout and gives a forgiving hit area near the boundary so a 1-2px
 * jitter from scroll/animation doesn't cause the edge gap to flicker.
 */
const EDGE_TOLERANCE_PX = 10;

/**
 * Single source of truth for "which node DOM elements are near or in
 * the viewport". Owns the IntersectionObserver and the reactive maps
 * consumed by NodeGap and NodeGapMarkers.
 */
class VisibilityRegistry {
	/** Per-node "in overscan zone" flag. NodeGap reads via `.has(path)`. */
	near_map = new SvelteMap();

	/**
	 * Per-array set of near child indices. NodeGapMarkers iterates the
	 * set for its array. Stable references — once a SvelteSet is created
	 * for an array path it survives re-renders so consumers stay subscribed.
	 *
	 * @type {Map<string, SvelteSet<number>>}
	 */
	#array_indices = new Map();

	/**
	 * Per-array edge-proximity state. `first` is true when the first
	 * node's leading edge is within EDGE_TOLERANCE_PX of the array
	 * container's leading edge; `last` is the symmetric trailing-edge
	 * check on the last node. Recomputed on scroll/resize via BCR
	 * because IntersectionObserver only fires on intersection-ratio
	 * threshold crossings and would otherwise miss horizontal-overflow
	 * scroll changes that don't change the visibility ratio.
	 *
	 * NodeGap and NodeGapMarkers read this to gate edge gaps so they
	 * only render when the edge node has actually reached the matching
	 * end of its container.
	 *
	 * @type {SvelteMap<string, { first: boolean, last: boolean }>}
	 */
	edge_map = new SvelteMap();

	/** @type {IntersectionObserver | null} */
	#io = null;

	/** @type {IntersectionObserver | null} */
	#view_io = null;

	/** @type {Set<HTMLElement>} */
	#pending_view_sync = new Set();
	#pending_view_raf = 0;

	/**
	 * When true, a second IO (rootMargin 0, actual viewport) toggles
	 * `.in-view` / `.seen` / `.fully-in-view` / `.visible-top` /
	 * `.visible-bottom` on node elements — useful for scrollytelling
	 * and reveal animations.
	 *
	 * A separate observer is required because the overscan IO (rootMargin
	 * 500px) fires its thresholds while nodes are still outside the real
	 * viewport — by the time a node scrolls into view, both thresholds
	 * have already been crossed and no further callback fires.
	 *
	 * Opt out via `session.config.view_classes = false` to skip the
	 * second observer entirely.
	 */
	view_classes = true;

	/**
	 * When true, the overscan IO populates near_map and gates
	 * `.positioned` on gap elements by viewport proximity. When false,
	 * the overscan IO is skipped entirely: observe() pre-populates
	 * near_map / array_indices as if every node were always in the
	 * overscan zone, so every gap is `.positioned` and every marker
	 * renders. Useful for diagnosing whether a layout bug originates
	 * in the IO culling logic vs. the underlying CSS / anchor
	 * positioning.
	 *
	 * Disabling makes anchor positioning O(N) over every node in the
	 * document and is intended for debugging only; large documents
	 * (hundreds of nodes) can become unresponsive without the culling.
	 *
	 * Opt out via `session.config.visibility_culling = false`.
	 */
	visibility_culling = true;

	start() {
		if (typeof window === 'undefined') return;
		// Overscan IO: threshold [0] is enough — #process_near only reads
		// entry.isIntersecting (a boolean) and writes are change-detected,
		// so extra firings at threshold[1] would be no-ops.
		if (this.visibility_culling && !this.#io) {
			this.#io = new IntersectionObserver((entries) => this.#process_near(entries), {
				rootMargin: `${OVERSCAN_PX}px`,
				threshold: [0]
			});
		}
		// View IO: threshold [0, 1] is load-bearing — #apply_view_classes
		// toggles .fully-in-view, which flips when the node crosses the
		// fully-visible boundary at ratio 1.
		if (this.view_classes && !this.#view_io) {
			this.#view_io = new IntersectionObserver((entries) => this.#process_view(entries), {
				threshold: [0, 1]
			});
		}
	}

	stop() {
		this.#io?.disconnect();
		this.#io = null;
		this.#view_io?.disconnect();
		this.#view_io = null;
		cancelAnimationFrame(this.#pending_view_raf);
		this.#pending_view_raf = 0;
		this.#pending_view_sync.clear();
		this.near_map.clear();
		this.edge_map.clear();
		for (const set of this.#array_indices.values()) set.clear();
	}

	/**
	 * Returns the (lazily created, stable) SvelteSet for an array path.
	 * Callers should hold the returned reference for the lifetime of the
	 * subscription — the same set is returned on subsequent calls so
	 * Svelte's per-set tracking remains intact across re-evaluations.
	 *
	 * @param {string} array_path_str
	 * @returns {SvelteSet<number>}
	 */
	get_array_indices(array_path_str) {
		let set = this.#array_indices.get(array_path_str);
		if (!set) {
			set = new SvelteSet();
			this.#array_indices.set(array_path_str, set);
		}
		return set;
	}

	/** @param {HTMLElement} el */
	observe(el) {
		if (this.visibility_culling) {
			this.#io?.observe(el);
		} else {
			// No overscan IO: treat every node as always near with no
			// clipping. near_map / array_indices population mirrors what
			// the IO would write on its first callback, just without the
			// per-node viewport check. Sibling gaps still need a sync
			// pass because no IO callback will fire to drive it.
			//
			// untrack() is critical: the bootstrap loop calls observe()
			// from inside the create_node_visibility $effect, and the
			// .has() reads on reactive Map/Set would subscribe that
			// effect to the same maps we then write to — invalidating
			// itself and re-running the cleanup→start cycle infinitely.
			const path = el.dataset?.path;
			if (path) {
				untrack(() => {
					let any_change = false;
					if (!this.near_map.has(path)) {
						this.near_map.set(path, true);
						any_change = true;
					}
					const split = this.#split_path(path);
					if (split) {
						const set = this.get_array_indices(split.array_path);
						if (!set.has(split.index)) {
							set.add(split.index);
							any_change = true;
						}
					}
					if (any_change) this.sync_gaps_around_node(el);
				});
			}
		}
		this.#view_io?.observe(el);
	}

	/** @param {HTMLElement} el */
	unobserve(el) {
		this.#io?.unobserve(el);
		this.#view_io?.unobserve(el);
		const path = el.dataset?.path;
		if (path) this.#forget(path);
	}

	/**
	 * Imperatively toggle .positioned on a single gap element based on
	 * current near_map / edge_map state. Reads dataset + classList for
	 * gap context (no Svelte reactivity).
	 *
	 * @param {Element} gap_el
	 */
	sync_gap_class(gap_el) {
		const el = /** @type {HTMLElement} */ (gap_el);
		const arr = el.dataset.gapArrayPath;
		if (!arr) return;
		const offset = parseInt(el.dataset.gapOffset, 10);
		const is_last = el.classList.contains('last');
		const empty = el.classList.contains('empty');
		el.classList.toggle(
			'positioned',
			should_position_gap_imperative(this, arr, offset, is_last, empty)
		);
	}

	/**
	 * Toggle .positioned on the two gap elements adjacent to a node
	 * element. Used after near_map writes triggered by IO, MO, or
	 * bootstrap. O(1) DOM sibling traversal.
	 *
	 * @param {Element} node_el
	 */
	sync_gaps_around_node(node_el) {
		const prev = node_el.previousElementSibling;
		if (prev?.classList.contains('node-gap')) this.sync_gap_class(prev);
		const next = node_el.nextElementSibling;
		if (next?.classList.contains('node-gap')) this.sync_gap_class(next);
	}

	/**
	 * Update edge_map for an array from its scrollLeft/scrollWidth/
	 * clientWidth (and the y-axis equivalents). Returns true when the
	 * state actually changed. Uses only the array's own scroll metrics
	 * — no BCRs, no per-node measurements, no querying children — so
	 * each call is ~6 property reads on one element regardless of how
	 * many nodes the array has.
	 *
	 * For a non-overflowing array (scrollWidth === clientWidth, etc.)
	 * both checks pass, so first/last gaps stay visible as expected.
	 * For an overflowing array, first is true only when scrolled to
	 * the start and last only when scrolled to the end (within
	 * EDGE_TOLERANCE_PX).
	 *
	 * Writes to edge_map are wrapped in untrack() so this can be
	 * called transitively from $effect contexts without self-
	 * invalidation.
	 *
	 * @param {Element} array_el
	 * @returns {boolean}
	 */
	sync_edge_state(array_el) {
		if (!array_el) return false;
		const path = /** @type {HTMLElement} */ (array_el).dataset.path;
		if (!path) return false;

		const sl = array_el.scrollLeft;
		const sw = array_el.scrollWidth;
		const cw = array_el.clientWidth;
		const st = array_el.scrollTop;
		const sh = array_el.scrollHeight;
		const ch = array_el.clientHeight;

		const style = getComputedStyle(array_el);
		const clips_x = style.overflowX !== 'visible';
		const clips_y = style.overflowY !== 'visible';

		// Only use scroll metrics on axes where this array actually clips/scrolls.
		// Normal wrapping/grid node arrays often have harmless layout overflow
		// (scrollWidth > clientWidth) while overflow remains visible; treating
		// that as scroll position would incorrectly hide edge gaps.
		const first =
			(!clips_x || sl <= EDGE_TOLERANCE_PX) &&
			(!clips_y || st <= EDGE_TOLERANCE_PX);
		const last =
			(!clips_x || sl + cw >= sw - EDGE_TOLERANCE_PX) &&
			(!clips_y || st + ch >= sh - EDGE_TOLERANCE_PX);

		return untrack(() => {
			const prev = this.edge_map.get(path);
			if (prev && prev.first === first && prev.last === last) return false;
			this.edge_map.set(path, { first, last });
			return true;
		});
	}

	/**
	 * Sync edge state and toggle .positioned on first/last gaps. Early-
	 * exits when edge_map is unchanged — for the structural-mutation
	 * path where the edge gap may need re-evaluation regardless of
	 * edge_map, see resync_array_edge_gaps below.
	 *
	 * @param {Element} array_el
	 */
	sync_array_edge_gaps(array_el) {
		if (!this.sync_edge_state(array_el)) return;
		this.#sync_first_last_gaps(array_el);
	}

	/**
	 * Force-resync first/last gaps after a structural mutation. The
	 * trailing gap is a reused Svelte component whose `.positioned`
	 * state may need re-deriving even when edge_map didn't change.
	 *
	 * @param {Element} array_el
	 */
	resync_array_edge_gaps(array_el) {
		this.sync_edge_state(array_el);
		this.#sync_first_last_gaps(array_el);
	}

	/** @param {Element} array_el */
	#sync_first_last_gaps(array_el) {
		const first_gap = array_el.querySelector(':scope > .node-gap.gap-before:not(.empty)');
		const last_gap = array_el.querySelector(':scope > .node-gap.gap-after.last');
		if (first_gap) this.sync_gap_class(first_gap);
		if (last_gap) this.sync_gap_class(last_gap);
	}

	/**
	 * Queue a node for deferred view-class sync. Unobserves from the
	 * viewport IO immediately to prevent its initial callback from
	 * racing with the RAF, then re-observes in #flush_view_sync after
	 * classes are applied via BCR. Multiple MO-triggered insertions
	 * coalesce into a single RAF / layout pass.
	 *
	 * @param {HTMLElement} el
	 */
	schedule_view_sync(el) {
		if (!this.view_classes) return;
		this.#view_io?.unobserve(el);
		this.#pending_view_sync.add(el);
		if (!this.#pending_view_raf) {
			this.#pending_view_raf = requestAnimationFrame(() => this.#flush_view_sync());
		}
	}

	#flush_view_sync() {
		this.#pending_view_raf = 0;
		const vh = window.innerHeight;
		const vw = window.innerWidth;
		// Read all BCRs first, then write all classes. A read-write-read
		// interleave (the natural single-pass shape) forces a layout
		// flush on every iteration when the toggled classes affect
		// layout — which user apps are free to do via `.in-view` /
		// `.fully-in-view` / etc. Two passes batch the layout reads into
		// one flush regardless of what the consumer wires up.
		/** @type {Array<{el: HTMLElement, bcr: DOMRectReadOnly}>} */
		const items = [];
		for (const el of this.#pending_view_sync) {
			if (el.isConnected) items.push({ el, bcr: el.getBoundingClientRect() });
		}
		for (const { el, bcr } of items) {
			const in_viewport =
				bcr.bottom > 0 && bcr.top < vh && bcr.right > 0 && bcr.left < vw;
			this.#apply_view_classes(el, in_viewport, bcr, vh);
			this.#view_io?.observe(el);
		}
		this.#pending_view_sync.clear();
	}

	/**
	 * @param {HTMLElement} el
	 * @param {boolean} in_viewport
	 * @param {DOMRectReadOnly} bcr
	 * @param {number} vh
	 */
	#apply_view_classes(el, in_viewport, bcr, vh) {
		const cl = el.classList;
		cl.toggle('in-view', in_viewport);
		if (in_viewport) {
			cl.add('seen');
			const top_clipped = bcr.top < -0.5;
			const bottom_clipped = bcr.bottom > vh + 0.5;
			cl.toggle('fully-in-view', !top_clipped && !bottom_clipped);
			cl.toggle('visible-top', !top_clipped && bottom_clipped);
			cl.toggle('visible-bottom', top_clipped && !bottom_clipped);
		} else {
			cl.remove('fully-in-view', 'visible-top', 'visible-bottom');
		}
	}

	/** @param {string} path */
	#forget(path) {
		this.near_map.delete(path);
		const split = this.#split_path(path);
		if (split) {
			const set = this.#array_indices.get(split.array_path);
			set?.delete(split.index);
			// Keep the SvelteSet alive — its NodeGapMarkers consumer may
			// still be mounted. Recreating would orphan the subscription.
		}
	}

	/**
	 * @param {string} path
	 * @returns {{ array_path: string, index: number } | null}
	 */
	#split_path(path) {
		const sep = path.lastIndexOf(PATH_SEPARATOR);
		if (sep < 0) return null;
		const index = parseInt(path.slice(sep + PATH_SEPARATOR.length), 10);
		if (Number.isNaN(index)) return null;
		return { array_path: path.slice(0, sep), index };
	}

	/**
	 * Overscan IO callback. Manages near_map and array_indices, then
	 * imperatively toggles .positioned on adjacent gaps.
	 *
	 * @param {IntersectionObserverEntry[]} entries
	 */
	#process_near(entries) {
		for (const entry of entries) {
			const el = /** @type {HTMLElement} */ (entry.target);
			const path = el.dataset.path;
			if (!path) continue;

			const is_near = entry.isIntersecting;

			let any_change = false;

			if (is_near) {
				if (!this.near_map.has(path)) {
					this.near_map.set(path, true);
					any_change = true;
				}
			} else if (this.near_map.has(path)) {
				this.near_map.delete(path);
				any_change = true;
			}

			const split = this.#split_path(path);
			if (split) {
				const set = this.get_array_indices(split.array_path);
				if (is_near) set.add(split.index);
				else set.delete(split.index);
			}

			if (any_change) this.sync_gaps_around_node(el);
		}
	}

	/**
	 * Viewport IO callback. Toggles view classes on node elements.
	 * Runs on a separate observer with rootMargin 0 so thresholds
	 * fire at actual viewport edges, not the overscan boundary.
	 *
	 * @param {IntersectionObserverEntry[]} entries
	 */
	#process_view(entries) {
		const vh = window.innerHeight;
		for (const entry of entries) {
			const el = /** @type {HTMLElement} */ (entry.target);
			if (!el.dataset.path) continue;
			this.#apply_view_classes(el, entry.isIntersecting, entry.boundingClientRect, vh);
		}
	}

	// #clip_bits and clip_map were removed: their only consumer was the
	// edge-gap visibility check, and they went stale on nested horizontal
	// scroll (IO doesn't re-fire when the intersection ratio doesn't
	// cross a threshold). Replaced by edge_map, derived from the array's
	// own scrollLeft / clientWidth / scrollWidth — one element, six
	// property reads per dirty array per RAF, no per-node BCRs.
}

/**
 * Install the visibility registry on the svedit context and wire up
 * the IntersectionObserver + MutationObserver lifecycle to editable
 * state.
 *
 * @param {object} svedit - Svedit context (session, editable, canvas_el)
 */
export function create_node_visibility(svedit) {
	const registry = new VisibilityRegistry();
	registry.view_classes = svedit.session?.config?.view_classes !== false;
	registry.visibility_culling = svedit.session?.config?.visibility_culling !== false;
	svedit.visibility_registry = registry;

	$effect(() => {
		if (typeof window === 'undefined') return;

		// Empty node-array placeholders only exist in edit mode, so re-run
		// the bootstrap when editability changes to observe them reliably.
		svedit.editable;

		registry.start();
		// Observe every existing node. NO getBoundingClientRect — it
		// would force layout on each call, and at 2000+ nodes the
		// bootstrap interleaves with Svelte's mount work, retriggering
		// layout for the growing DOM (~1.5 s of forced reflow when
		// traced). IO populates near_map / array_indices on its first
		// callback, ~1 frame after observe(). The lag is invisible:
		// un-positioned NodeGaps have zero layout presence.
		for (const el of document.querySelectorAll(NODE_SELECTOR)) {
			registry.observe(/** @type {HTMLElement} */ (el));
		}

		// Bootstrap edge_map for arrays already in the DOM. One-time
		// scrollLeft/clientWidth pass — cheap (one element, six property
		// reads each) and never repeated outside this mount.
		for (const arr of document.querySelectorAll('[data-type="node_array"]')) {
			registry.sync_array_edge_gaps(arr);
		}

		const canvas =
			untrack(() => svedit.canvas_el) || document.querySelector('.svedit-canvas');
		/** @type {MutationObserver | null} */
		let mo = null;
		let raf = 0;

		/**
		 * Scroll listener for nested scroll containers. IntersectionObserver
		 * doesn't reliably re-fire when the user scrolls inside a non-root
		 * scrollable element (Chrome's IO samples on viewport scroll, not on
		 * intermediate scroll-container scrolls), so we listen for scroll
		 * events on the document in capture phase. The handler is hot but
		 * cheap: a single `.closest()` check exits in O(1) for the common
		 * case (page scroll → target is document/body, not an array) and
		 * coalesces array scrolls into one RAF that reads only scrollLeft /
		 * scrollWidth / clientWidth — no per-node BCRs.
		 */
		/** @type {Set<Element>} */
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive RAF queue.
		const pending_scroll_arrays = new Set();
		let scroll_raf = 0;
		function flush_scroll_sync() {
			scroll_raf = 0;
			for (const arr of pending_scroll_arrays) {
				if (arr.isConnected) registry.sync_array_edge_gaps(arr);
			}
			pending_scroll_arrays.clear();
		}
		/** @param {Event} event */
		function on_scroll(event) {
			const target = /** @type {Element | null} */ (event.target);
			const arr = target?.closest?.('[data-type="node_array"]');
			if (!arr) return;
			pending_scroll_arrays.add(arr);
			if (!scroll_raf) scroll_raf = requestAnimationFrame(flush_scroll_sync);
		}
		document.addEventListener('scroll', on_scroll, { capture: true, passive: true });

		if (canvas) {
			mo = new MutationObserver((mutations) => {
				/** @type {Set<Element>} */
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive per-mutation queue.
				const dirty_arrays = new Set();
				for (const m of mutations) {
					for (const added of m.addedNodes) {
						if (added.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (added);
						if (el.matches(NODE_SELECTOR)) {
							registry.observe(el);
							registry.schedule_view_sync(el);
							const arr = el.closest('[data-type="node_array"]');
							if (arr) dirty_arrays.add(arr);
						}
						// Newly-mounted gaps need immediate .positioned sync —
						// the IO won't fire for the EXISTING adjacent node
						// (its intersection didn't change), so the gap would
						// stay un-positioned until the next scroll.
						if (el.matches(GAP_SELECTOR)) {
							registry.sync_gap_class(el);
						}
						for (const child of el.querySelectorAll(NODE_SELECTOR)) {
							const node_el = /** @type {HTMLElement} */ (child);
							registry.observe(node_el);
							registry.schedule_view_sync(node_el);
							const arr = node_el.closest('[data-type="node_array"]');
							if (arr) dirty_arrays.add(arr);
						}
						for (const child of el.querySelectorAll(GAP_SELECTOR)) {
							registry.sync_gap_class(child);
						}
					}
					for (const removed of m.removedNodes) {
						if (removed.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (removed);
						if (el.matches(NODE_SELECTOR)) registry.unobserve(el);
						for (const child of el.querySelectorAll(NODE_SELECTOR)) {
							registry.unobserve(/** @type {HTMLElement} */ (child));
						}
					}
				}
				for (const arr of dirty_arrays) registry.resync_array_edge_gaps(arr);
			});
			// Defer one frame to skip the initial Svelte mount burst,
			// which the bootstrap above already covered.
			raf = requestAnimationFrame(() => {
				mo.observe(canvas, { childList: true, subtree: true });
			});
		}

		return () => {
			document.removeEventListener('scroll', on_scroll, true);
			cancelAnimationFrame(raf);
			cancelAnimationFrame(scroll_raf);
			pending_scroll_arrays.clear();
			mo?.disconnect();
			registry.stop();
		};
	});
}

/**
 * Non-reactive visibility check used by the imperative .positioned
 * toggle. Reads near_map / edge_map inside untrack() because this is
 * called from sync_gap_class which can run transitively from the
 * bootstrap $effect, and a subscription here would self-invalidate
 * (the same effect writes to these maps and would re-run forever).
 * `is_last` and `empty` come from the gap element's classList, so we
 * don't need `count` here.
 *
 * @param {VisibilityRegistry} registry
 * @param {string} array_path_str
 * @param {number} offset
 * @param {boolean} is_last
 * @param {boolean} empty
 */
function should_position_gap_imperative(registry, array_path_str, offset, is_last, empty) {
	if (!registry) return false;

	// untrack() is critical: this function is called transitively from
	// the bootstrap $effect (via sync_array_edge_gaps → sync_gap_class),
	// and the reactive-Map `.has()` / `.get()` reads here would
	// otherwise subscribe that effect to the same maps the bootstrap
	// then writes to — infinite re-run cycle that empties near_map
	// every time the IO tries to populate it.
	return untrack(() => {
		if (empty) {
			return registry.near_map.has(`${array_path_str}${PATH_SEPARATOR}0`);
		}

		// Edge gaps gate on near_map AND edge_map. edge_map is the
		// scroll-aware BCR-based check that the adjacent edge node has
		// actually reached the matching end of its array container
		// (within EDGE_TOLERANCE_PX). We can't rely on IO clip_map here
		// because IO only fires on intersection-ratio threshold
		// crossings and misses scroll changes within a horizontal-
		// overflow container that don't change the visibility ratio.
		if (offset === 0) {
			if (!registry.near_map.has(`${array_path_str}${PATH_SEPARATOR}0`)) return false;
			return registry.edge_map.get(array_path_str)?.first === true;
		}

		if (is_last) {
			if (!registry.near_map.has(`${array_path_str}${PATH_SEPARATOR}${offset - 1}`)) return false;
			return registry.edge_map.get(array_path_str)?.last === true;
		}

		// Anchor to prev: gap-after's `position-anchor` is the previous node,
		// and `position-visibility: anchors-visible` already hides the gap
		// once that anchor is off-viewport. Gating `.positioned` on the next
		// flank being near as well would strand every between-row gap in a
		// wrap/grid layout whose row height exceeds ~OVERSCAN_PX (the next
		// row's leading node sits far outside the overscan even when the
		// previous row's trailing node is right under the user's cursor).
		// Checking prev alone is sufficient — visibility is handled by the
		// CSS rule, not by withholding `.positioned`.
		return registry.near_map.has(`${array_path_str}${PATH_SEPARATOR}${offset - 1}`);
	});
}
