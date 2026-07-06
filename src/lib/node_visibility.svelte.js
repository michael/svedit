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
 * ## Two observers + document reconciliation
 *
 * **Overscan IO** (`rootMargin: 500px`, threshold `0`) — fills
 * `near_map` and per-array `array_indices`. NodeGap derives its
 * `.positioned` class reactively from these maps.
 *
 * **Viewport IO** (`rootMargin: 0`, threshold `[0, 1]`) — toggles
 * view classes (`.in-view`, `.fully-in-view`, …) on node elements.
 * OPT-IN via `session.config.view_classes`. A separate observer is
 * required because the overscan IO fires its thresholds while nodes
 * are still 500px outside the real viewport.
 *
 * **Document changes** — after Svelte updates the DOM, all mounted node
 * elements are reconciled in one batch. This is deliberately not driven
 * by a MutationObserver: keyed Svelte updates can change several paths at
 * once, and processing those path changes individually creates transient
 * collisions and stale indices.
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
 * (array_indices). Consumers (NodeGap and NodeGapMarkers, both via
 * $derived) read via .has()/.get() — Svelte's runtime tracks at
 * per-key granularity, so only consumers whose specific dependencies
 * changed re-evaluate. Because the `.positioned` class is applied
 * declaratively by NodeGap, it survives DOM recreation that happens
 * without a document change (e.g. dev-mode HMR component swaps).
 *
 * View classes are toggled imperatively (no Svelte consumers — they're
 * pure CSS hooks for app code).
 *
 * @module
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { tick, untrack } from 'svelte';
import { PATH_SEPARATOR } from './utils.js';

const NODE_SELECTOR = '[data-type="node"][data-path]';

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
	#observed_nodes = new Set();

	/** @type {Set<HTMLElement>} */
	#near_nodes = new Set();

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
	 * the overscan IO is skipped and reconciliation treats every mounted
	 * node as near, so every gap is `.positioned` and every marker renders.
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
		this.#observed_nodes.clear();
		this.#near_nodes.clear();
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

	/**
	 * Reconcile all structural visibility state from the completed DOM.
	 *
	 * This runs after a document change and a Svelte tick. Rebuilding paths
	 * as one batch avoids the path-collision bug caused by processing keyed
	 * element updates individually (for example 0→1 while another element
	 * still owns path 1).
	 *
	 * Bounding boxes are read only on document changes, not while scrolling.
	 * IntersectionObserver remains responsible for subsequent viewport
	 * transitions.
	 *
	 * @param {HTMLElement} canvas
	 */
	reconcile(canvas) {
		const nodes = Array.from(
			canvas.querySelectorAll(NODE_SELECTOR),
			(el) => /** @type {HTMLElement} */ (el)
		).filter((el) => el.closest('.svedit-canvas') === canvas);
		const mounted = new Set(nodes);

		for (const el of this.#observed_nodes) {
			if (mounted.has(el)) continue;
			this.#io?.unobserve(el);
			this.#view_io?.unobserve(el);
			this.#near_nodes.delete(el);
		}
		for (const el of nodes) {
			if (this.#observed_nodes.has(el)) continue;
			this.#io?.observe(el);
			this.#view_io?.observe(el);
		}
		this.#observed_nodes = mounted;

		const needs_rects = this.visibility_culling || this.view_classes;
		const vh = window.innerHeight;
		const vw = window.innerWidth;
		const items = nodes.map((el) => ({
			el,
			bcr: needs_rects ? el.getBoundingClientRect() : null
		}));

		this.#near_nodes.clear();
		this.near_map.clear();
		for (const set of this.#array_indices.values()) set.clear();

		for (const { el, bcr } of items) {
			const is_near =
				!this.visibility_culling ||
				(bcr.bottom > -OVERSCAN_PX &&
					bcr.top < vh + OVERSCAN_PX &&
					bcr.right > -OVERSCAN_PX &&
					bcr.left < vw + OVERSCAN_PX);
			if (is_near) this.#add_near_node(el);

			if (this.view_classes) {
				const in_viewport = bcr.bottom > 0 && bcr.top < vh && bcr.right > 0 && bcr.left < vw;
				this.#apply_view_classes(el, in_viewport, bcr, vh);
			}
		}

		this.edge_map.clear();
		const arrays = Array.from(canvas.querySelectorAll('[data-type="node_array"]')).filter(
			(el) => el.closest('.svedit-canvas') === canvas
		);
		for (const array_el of arrays) this.sync_edge_state(array_el);
	}

	/** @param {HTMLElement} el */
	#add_near_node(el) {
		const path = el.dataset.path;
		if (!path) return;
		this.#near_nodes.add(el);
		this.near_map.set(path, true);
		const split = this.#split_path(path);
		if (split) this.get_array_indices(split.array_path).add(split.index);
	}

	/** @param {HTMLElement} el */
	#remove_near_node(el) {
		const path = el.dataset.path;
		this.#near_nodes.delete(el);
		if (!path) return;
		this.near_map.delete(path);
		const split = this.#split_path(path);
		if (split) this.#array_indices.get(split.array_path)?.delete(split.index);
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
		const first = (!clips_x || sl <= EDGE_TOLERANCE_PX) && (!clips_y || st <= EDGE_TOLERANCE_PX);
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
	 * Overscan IO callback. Manages near_map and array_indices; NodeGap
	 * reacts to the map writes and updates .positioned declaratively.
	 *
	 * @param {IntersectionObserverEntry[]} entries
	 */
	#process_near(entries) {
		for (const entry of entries) {
			const el = /** @type {HTMLElement} */ (entry.target);
			if (!this.#observed_nodes.has(el) || !el.isConnected || !el.dataset.path) continue;

			const is_near = entry.isIntersecting;
			if (is_near === this.#near_nodes.has(el)) continue;
			if (is_near) this.#add_near_node(el);
			else this.#remove_near_node(el);
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
			if (!this.#observed_nodes.has(el) || !el.isConnected || !el.dataset.path) continue;
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
 * Install the visibility registry on the svedit context.
 *
 * IntersectionObserver owns viewport changes. Document changes trigger
 * one complete DOM reconciliation after Svelte has rendered the new
 * structure. Keeping those responsibilities separate avoids maintaining
 * a second, mutation-driven model of the node-array DOM.
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

		const canvas = svedit.canvas_el;
		if (!canvas) return;
		registry.start();

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
				if (arr.isConnected) registry.sync_edge_state(arr);
			}
			pending_scroll_arrays.clear();
		}
		/** @param {Event} event */
		function on_scroll(event) {
			const target = /** @type {Element | null} */ (event.target);
			const arr = target?.closest?.('[data-type="node_array"]');
			if (!arr || arr.closest('.svedit-canvas') !== canvas) return;
			pending_scroll_arrays.add(arr);
			if (!scroll_raf) scroll_raf = requestAnimationFrame(flush_scroll_sync);
		}
		document.addEventListener('scroll', on_scroll, { capture: true, passive: true });

		return () => {
			document.removeEventListener('scroll', on_scroll, true);
			cancelAnimationFrame(scroll_raf);
			pending_scroll_arrays.clear();
			registry.stop();
		};
	});

	$effect(() => {
		if (typeof window === 'undefined') return;

		const canvas = svedit.canvas_el;
		if (!canvas) return;

		// These are the two structural inputs. Selection intentionally does
		// not participate; NodeGapMarkers tracks it directly for caret state.
		svedit.session.doc;
		svedit.editable;

		let cancelled = false;
		tick().then(() => {
			if (!cancelled && canvas.isConnected) registry.reconcile(canvas);
		});

		return () => {
			cancelled = true;
		};
	});
}

/**
 * Reactive visibility check for a gap's `.positioned` class. NodeGap
 * calls this from a $derived, so the near_map / edge_map reads are
 * tracked at per-key granularity — a gap re-evaluates only when its
 * own dependencies change. Applying the class declaratively means it
 * survives DOM recreation without a document change (e.g. dev-mode
 * HMR component swaps).
 *
 * @param {VisibilityRegistry} registry
 * @param {string} array_path_str
 * @param {number} offset
 * @param {boolean} is_last
 * @param {boolean} empty
 */
export function should_position_gap(registry, array_path_str, offset, is_last, empty) {
	if (!registry) return false;

	if (empty) {
		return registry.near_map.has(`${array_path_str}${PATH_SEPARATOR}0`);
	}

	// Edge gaps gate on near_map AND edge_map. edge_map is the
	// scroll-aware check that the adjacent edge node has actually
	// reached the matching end of its array container (within
	// EDGE_TOLERANCE_PX). We can't rely on the IO here because it only
	// fires on intersection-ratio threshold crossings and misses scroll
	// changes within a horizontal-overflow container that don't change
	// the visibility ratio.
	if (offset === 0) {
		if (!registry.near_map.has(`${array_path_str}${PATH_SEPARATOR}0`)) return false;
		return registry.edge_map.get(array_path_str)?.first === true;
	}

	if (is_last) {
		if (!registry.near_map.has(`${array_path_str}${PATH_SEPARATOR}${offset - 1}`)) return false;
		return registry.edge_map.get(array_path_str)?.last === true;
	}

	return (
		registry.near_map.has(`${array_path_str}${PATH_SEPARATOR}${offset - 1}`) &&
		registry.near_map.has(`${array_path_str}${PATH_SEPARATOR}${offset}`)
	);
}
