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
 * ## Element registration via attachments
 *
 * Node elements (Node.svelte and the empty-array placeholder) register
 * themselves with `{@attach registry.track_node(path)}`; node-array
 * containers use `{@attach registry.track_array(path)}`. Attachments
 * re-run whenever Svelte recreates the element or its path changes, so
 * observation and per-path state follow the DOM's actual lifecycle —
 * including DOM recreation without a document change (e.g. dev-mode
 * HMR component swaps), which a document-driven reconciliation pass
 * would miss.
 *
 * During keyed updates several elements can change paths at once
 * (e.g. 0→1 while a new element claims 0), and Svelte doesn't
 * guarantee attachment ordering across elements. Per-path ownership
 * maps make unregistration collision-safe: a teardown only clears a
 * path's state if that element still owns the path.
 *
 * ## Two observers
 *
 * **Overscan IO** (`rootMargin: 500px`, threshold `0`) — fills the
 * per-array `array_indices` sets. NodeGap derives its `.positioned`
 * class reactively from them. Registration seeds
 * the state synchronously from one getBoundingClientRect (so there's
 * no unpositioned flash on mount); the IO owns subsequent viewport
 * transitions, including layout-shift-induced ones.
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
 * **Document changes** — content changes alter an array's scroll
 * extent without recreating the array element, so after Svelte
 * updates the DOM all registered arrays re-sync their edge state in
 * one batch.
 *
 * **Array ResizeObserver** — box-size changes (window resize, sidebar
 * toggle, responsive breakpoint) can flip an array between fitting
 * and overflowing without a scroll event or document change; a shared
 * ResizeObserver on registered arrays re-syncs their edge state.
 *
 * ## Reactivity
 *
 * State lives in per-array SvelteSets (array_indices, the single
 * source of truth for node nearness) and a SvelteMap (edge_map).
 * Consumers (NodeGap and NodeGapMarkers, both via
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
 * the viewport". Owns the IntersectionObservers and the reactive maps
 * consumed by NodeGap and NodeGapMarkers. Elements register through
 * the track_node / track_array attachments.
 */
class VisibilityRegistry {
	/**
	 * Per-array set of near ("in overscan zone") child indices — the
	 * single source of truth for node nearness. NodeGap reads via
	 * `.has(index)`, NodeGapMarkers iterates the set for its array.
	 * Stable references — once a SvelteSet is created for an array path
	 * it survives re-renders so consumers stay subscribed.
	 *
	 * @type {Map<string, SvelteSet<number>>}
	 */
	#array_indices = new Map();

	/**
	 * Per-array edge-proximity state. `first` is true when the first
	 * node's leading edge is within EDGE_TOLERANCE_PX of the array
	 * container's leading edge; `last` is the symmetric trailing-edge
	 * check on the last node. Recomputed on scroll, on array box
	 * resize and after document changes because IntersectionObserver
	 * only fires on intersection-ratio threshold crossings and would
	 * otherwise miss horizontal-overflow scroll changes that don't
	 * change the visibility ratio.
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

	/**
	 * Re-syncs edge state when a registered array's box changes size
	 * (window resize, sidebar toggle, responsive breakpoint, late-
	 * loading content). Size changes can flip an array between fitting
	 * and overflowing without firing a scroll event or a document
	 * change, so neither of the other two triggers would catch them.
	 * Writes are change-detected, so redundant firings are no-ops.
	 *
	 * @type {ResizeObserver | null}
	 */
	#array_ro = null;

	/**
	 * Registered node elements and the path each was registered under.
	 * The attachment closure carries the path, so a stale data-path
	 * attribute can never desync state.
	 *
	 * @type {Map<HTMLElement, string>}
	 */
	#registered_paths = new Map();

	/**
	 * Which element currently owns a node path. Guards unregistration
	 * against keyed-update collisions (see module doc).
	 *
	 * @type {Map<string, HTMLElement>}
	 */
	#path_owners = new Map();

	/** @type {Set<HTMLElement>} */
	#near_nodes = new Set();

	/** Registered node-array container elements. @type {Set<Element>} */
	#array_els = new Set();

	/** Which element currently owns an array path. @type {Map<string, Element>} */
	#array_owners = new Map();

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
	 * When true, the overscan IO populates array_indices and NodeGap gates
	 * `.positioned` by viewport proximity. When false, the overscan IO
	 * is skipped and every registered node counts as near, so every gap
	 * is `.positioned` and every marker renders.
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
		if (!this.#array_ro) {
			this.#array_ro = new ResizeObserver((entries) => {
				for (const entry of entries) this.sync_edge_state(entry.target);
			});
		}
	}

	stop() {
		this.#io?.disconnect();
		this.#io = null;
		this.#view_io?.disconnect();
		this.#view_io = null;
		this.#array_ro?.disconnect();
		this.#array_ro = null;
		this.#registered_paths.clear();
		this.#path_owners.clear();
		this.#near_nodes.clear();
		this.#array_els.clear();
		this.#array_owners.clear();
		this.edge_map.clear();
		for (const set of this.#array_indices.values()) set.clear();
	}

	/**
	 * Returns the (lazily created, stable) SvelteSet for an array path.
	 * Callers should hold the returned reference for the lifetime of the
	 * subscription — the same set is returned on subsequent calls so
	 * Svelte's per-set tracking remains intact across re-evaluations.
	 *
	 * IMPORTANT: hold the returned set in its own $derived and read
	 * membership from a different one (see NodeGap / NodeGapMarkers).
	 * Svelte does not track dependencies on state created inside the
	 * currently-evaluating reaction, so a consumer that lazily creates
	 * the set and reads `.has()` in the same derived never subscribes
	 * and never re-evaluates.
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
	 * Attachment factory for node elements (Node.svelte and the
	 * empty-array placeholder). Registers the element under `path`,
	 * seeds its near / view-class state synchronously from one BCR, and
	 * hands the element to the IntersectionObservers for subsequent
	 * viewport transitions. Re-runs when the element is recreated or
	 * its path changes; the teardown unregisters collision-safely.
	 *
	 * @param {string} path
	 */
	track_node(path) {
		return (/** @type {HTMLElement} */ el) => {
			this.#register_node(el, path);
			return () => this.#unregister_node(el, path);
		};
	}

	/**
	 * Attachment factory for node-array container elements. Registered
	 * arrays get their edge state synced on mount, on scroll (via the
	 * document scroll listener) and after document changes.
	 *
	 * @param {string} path
	 */
	track_array(path) {
		return (/** @type {Element} */ el) => {
			this.start();
			this.#array_els.add(el);
			this.#array_owners.set(path, el);
			this.#array_ro?.observe(el);
			// Sync synchronously — the RO's initial callback fires a frame
			// later and would flash edge gaps un-positioned on mount.
			this.sync_edge_state(el);
			return () => {
				this.#array_els.delete(el);
				this.#array_ro?.unobserve(el);
				untrack(() => {
					if (this.#array_owners.get(path) === el) {
						this.#array_owners.delete(path);
						this.edge_map.delete(path);
					}
				});
			};
		};
	}

	/**
	 * Whether an element is a registered node-array container of this
	 * registry instance. Scopes the document-level scroll listener to
	 * this editor without any DOM traversal.
	 *
	 * @param {Element} el
	 */
	has_array(el) {
		return this.#array_els.has(el);
	}

	/**
	 * Re-sync edge state for every registered array. Called after
	 * document changes: content changes alter scroll extents without
	 * recreating the array element, so the attachments can't see them.
	 */
	sync_all_edge_states() {
		for (const el of this.#array_els) {
			if (el.isConnected) this.sync_edge_state(el);
		}
	}

	/**
	 * @param {HTMLElement} el
	 * @param {string} path
	 */
	#register_node(el, path) {
		this.start();
		untrack(() => {
			this.#registered_paths.set(el, path);
			this.#path_owners.set(path, el);
			this.#io?.observe(el);
			this.#view_io?.observe(el);

			// Seed state synchronously so freshly mounted (or recreated)
			// elements don't wait a frame for the IO's initial callback —
			// that would flash gaps un-positioned. The IO owns all later
			// transitions.
			const needs_rect = this.visibility_culling || this.view_classes;
			const bcr = needs_rect ? el.getBoundingClientRect() : null;
			const vh = window.innerHeight;
			const vw = window.innerWidth;
			const is_near =
				!this.visibility_culling ||
				(bcr.bottom > -OVERSCAN_PX &&
					bcr.top < vh + OVERSCAN_PX &&
					bcr.right > -OVERSCAN_PX &&
					bcr.left < vw + OVERSCAN_PX);
			if (is_near) this.#add_near_node(el, path);

			if (this.view_classes) {
				const in_viewport = bcr.bottom > 0 && bcr.top < vh && bcr.right > 0 && bcr.left < vw;
				this.#apply_view_classes(el, in_viewport, bcr, vh);
			}
		});
	}

	/**
	 * @param {HTMLElement} el
	 * @param {string} path
	 */
	#unregister_node(el, path) {
		this.#registered_paths.delete(el);
		this.#near_nodes.delete(el);
		this.#io?.unobserve(el);
		this.#view_io?.unobserve(el);
		untrack(() => {
			// Ownership guard: during keyed updates another element may
			// have already claimed this path — its state must survive.
			if (this.#path_owners.get(path) === el) {
				this.#path_owners.delete(path);
				const split = this.#split_path(path);
				if (split) this.#array_indices.get(split.array_path)?.delete(split.index);
			}
		});
	}

	/**
	 * @param {HTMLElement} el
	 * @param {string} path
	 */
	#add_near_node(el, path) {
		this.#near_nodes.add(el);
		const split = this.#split_path(path);
		if (split) this.get_array_indices(split.array_path).add(split.index);
	}

	/**
	 * @param {HTMLElement} el
	 * @param {string} path
	 */
	#remove_near_node(el, path) {
		this.#near_nodes.delete(el);
		if (this.#path_owners.get(path) !== el) return;
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

		// Check computed overflow BEFORE touching scroll metrics. Reading
		// scrollLeft/scrollWidth forces a synchronous layout when the DOM is
		// dirty, while getComputedStyle only forces style recalc. Non-clipping
		// arrays — the common case (a plain column body) — resolve to
		// first=last=true without any scroll-metric read.
		const style = getComputedStyle(array_el);
		const clips_x = style.overflowX !== 'visible';
		const clips_y = style.overflowY !== 'visible';

		// Only use scroll metrics on axes where this array actually clips/scrolls.
		// Normal wrapping/grid node arrays often have harmless layout overflow
		// (scrollWidth > clientWidth) while overflow remains visible; treating
		// that as scroll position would incorrectly hide edge gaps.
		let first = true;
		let last = true;
		if (clips_x) {
			const sl = array_el.scrollLeft;
			first = sl <= EDGE_TOLERANCE_PX;
			last = sl + array_el.clientWidth >= array_el.scrollWidth - EDGE_TOLERANCE_PX;
		}
		if (clips_y) {
			const st = array_el.scrollTop;
			first = first && st <= EDGE_TOLERANCE_PX;
			last = last && st + array_el.clientHeight >= array_el.scrollHeight - EDGE_TOLERANCE_PX;
		}

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
	 * Overscan IO callback. Manages the array_indices sets; NodeGap
	 * reacts to the map writes and updates .positioned declaratively.
	 *
	 * @param {IntersectionObserverEntry[]} entries
	 */
	#process_near(entries) {
		for (const entry of entries) {
			const el = /** @type {HTMLElement} */ (entry.target);
			const path = this.#registered_paths.get(el);
			if (!path || !el.isConnected) continue;

			const is_near = entry.isIntersecting;
			if (is_near === this.#near_nodes.has(el)) continue;
			if (is_near) this.#add_near_node(el, path);
			else this.#remove_near_node(el, path);
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
			if (!this.#registered_paths.has(el) || !el.isConnected) continue;
			this.#apply_view_classes(el, entry.isIntersecting, entry.boundingClientRect, vh);
		}
	}
}

/**
 * Install the visibility registry on the svedit context.
 *
 * Elements register themselves via the track_node / track_array
 * attachments, so registration follows the DOM's actual lifecycle.
 * The IntersectionObservers own viewport changes; document changes
 * only trigger an edge-state re-sync over the registered arrays.
 *
 * @param {object} svedit - Svedit context (session, editable)
 */
export function create_node_visibility(svedit) {
	const registry = new VisibilityRegistry();
	registry.view_classes = svedit.session?.config?.view_classes !== false;
	registry.visibility_culling = svedit.session?.config?.visibility_culling !== false;
	svedit.visibility_registry = registry;

	$effect(() => {
		if (typeof window === 'undefined') return;
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
			if (!arr || !registry.has_array(arr)) return;
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

		// Structural inputs whose changes can alter array scroll extents
		// without recreating array elements. Selection intentionally does
		// not participate; NodeGapMarkers tracks it directly for caret state.
		svedit.session.doc;
		svedit.editable;

		let cancelled = false;
		tick().then(() => {
			if (!cancelled) registry.sync_all_edge_states();
		});

		return () => {
			cancelled = true;
		};
	});
}

/**
 * Pure visibility check for a gap's `.positioned` class. NodeGap calls
 * this from a $derived, so the `near.has()` reads are tracked at
 * per-key granularity — a gap re-evaluates only when its own
 * dependencies change. Applying the class declaratively means it
 * survives DOM recreation without a document change (e.g. dev-mode
 * HMR component swaps).
 *
 * `near` must come from `get_array_indices` held in a SEPARATE
 * $derived (see the note there): membership reads on a set created
 * within the same derived are not tracked by Svelte.
 *
 * @param {SvelteSet<number>} near - near child indices of the array
 * @param {{ first: boolean, last: boolean } | undefined} edge_state
 * @param {number} offset
 * @param {boolean} is_last
 * @param {boolean} empty
 */
export function should_position_gap(near, edge_state, offset, is_last, empty) {
	if (!near) return false;

	if (empty) {
		return near.has(0);
	}

	// Edge gaps gate on nearness AND edge state. edge_state is the
	// scroll-aware check that the adjacent edge node has actually
	// reached the matching end of its array container (within
	// EDGE_TOLERANCE_PX). We can't rely on the IO here because it only
	// fires on intersection-ratio threshold crossings and misses scroll
	// changes within a horizontal-overflow container that don't change
	// the visibility ratio.
	if (offset === 0) {
		if (!near.has(0)) return false;
		return edge_state?.first === true;
	}

	if (is_last) {
		if (!near.has(offset - 1)) return false;
		return edge_state?.last === true;
	}

	return near.has(offset - 1) && near.has(offset);
}
