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
 * ## Two observers, separated by root
 *
 * **Overscan IO** (`rootMargin: 500px`, threshold `[0]`):
 * 1. **near_map** — entry.isIntersecting is true for the rootMargin'd
 *    overscan zone. Drives `.positioned` activation on adjacent gaps.
 * 2. **clip_map** — computed from intersectionRect vs boundingClientRect
 *    for nested-scroller edge clip detection.
 *
 * **Viewport IO** (`rootMargin: 0`, threshold `[0, 1]`):
 * 3. **view classes** — `.in-view`, `.fully-in-view`, `.visible-top`,
 *    `.visible-bottom`, `.seen`. OPT-IN via `session.config.view_classes`.
 *    A separate observer is required because the overscan IO fires its
 *    thresholds while nodes are still 500px outside the real viewport —
 *    by the time a node scrolls into view, both thresholds have already
 *    been crossed and no further callback fires.
 *
 * ## Reactivity
 *
 * State lives in SvelteMap (near_map, clip_map) and per-array SvelteSet
 * (array_indices). Consumers (NodeGap, NodeGapMarkers) read via
 * .has()/.get() — Svelte's runtime tracks at per-key granularity, so
 * only consumers whose specific dependencies changed re-evaluate.
 *
 * View classes are toggled imperatively (no Svelte consumers — they're
 * pure CSS hooks for app code).
 *
 * @module
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { untrack } from 'svelte';

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
 * Single source of truth for "which node DOM elements are near or in
 * the viewport". Owns the IntersectionObserver and the reactive maps
 * consumed by NodeGap and NodeGapMarkers.
 */
class VisibilityRegistry {
	/** Per-node "in overscan zone" flag. NodeGap reads via `.has(path)`. */
	near_map = new SvelteMap(); // eslint-disable-line svelte/prefer-svelte-reactivity

	/**
	 * Per-node edge clip state for nested scrollers.
	 * 0b01 = leading edge clipped (top|left)
	 * 0b10 = trailing edge clipped (bottom|right)
	 */
	clip_map = new SvelteMap(); // eslint-disable-line svelte/prefer-svelte-reactivity

	/**
	 * Per-array set of near child indices. NodeGapMarkers iterates the
	 * set for its array. Stable references — once a SvelteSet is created
	 * for an array path it survives re-renders so consumers stay subscribed.
	 *
	 * @type {Map<string, SvelteSet<number>>}
	 */
	#array_indices = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

	/** @type {IntersectionObserver | null} */
	#io = null;

	/** @type {IntersectionObserver | null} */
	#view_io = null;

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
	 * Apps that don't use these CSS hooks can opt out via
	 * `session.config.view_classes = false` to skip the second observer
	 * entirely.
	 */
	view_classes = true;

	start() {
		if (typeof window === 'undefined' || this.#io) return;
		this.#io = new IntersectionObserver((entries) => this.#process_near(entries), {
			rootMargin: `${OVERSCAN_PX}px`,
			threshold: [0]
		});
		if (this.view_classes) {
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
		this.near_map.clear();
		this.clip_map.clear();
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
			set = new SvelteSet(); // eslint-disable-line svelte/prefer-svelte-reactivity
			this.#array_indices.set(array_path_str, set);
		}
		return set;
	}

	/** @param {HTMLElement} el */
	observe(el) {
		this.#io?.observe(el);
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
	 * current near_map / clip_map state. Reads dataset + classList for
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
	 * element. Used after near_map / clip_map writes triggered by IO,
	 * MO, or bootstrap. O(1) DOM sibling traversal.
	 *
	 * @param {Element} node_el
	 */
	sync_gaps_around_node(node_el) {
		const prev = node_el.previousElementSibling;
		if (prev?.classList.contains('node-gap')) this.sync_gap_class(prev);
		const next = node_el.nextElementSibling;
		if (next?.classList.contains('node-gap')) this.sync_gap_class(next);
	}

	/** @param {string} path */
	#forget(path) {
		this.near_map.delete(path);
		this.clip_map.delete(path);
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
		const dot = path.lastIndexOf('.');
		if (dot < 0) return null;
		const index = parseInt(path.slice(dot + 1), 10);
		if (Number.isNaN(index)) return null;
		return { array_path: path.slice(0, dot), index };
	}

	/**
	 * Overscan IO callback. Manages near_map, clip_map, array_indices,
	 * and imperative .positioned toggling on adjacent gaps.
	 *
	 * @param {IntersectionObserverEntry[]} entries
	 */
	#process_near(entries) {
		for (const entry of entries) {
			const el = /** @type {HTMLElement} */ (entry.target);
			const path = el.dataset.path;
			if (!path) continue;

			const is_near = entry.isIntersecting;
			const bcr = entry.boundingClientRect;
			const ir = entry.intersectionRect;

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

			const new_bits = is_near ? this.#clip_bits(bcr, ir) : 0b11;
			const old_bits = this.clip_map.get(path) ?? 0;
			if (new_bits !== old_bits) {
				if (new_bits === 0 || new_bits === 0b11) this.clip_map.delete(path);
				else this.clip_map.set(path, new_bits);
				any_change = true;
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
		const vw = window.innerWidth;

		for (const entry of entries) {
			const el = /** @type {HTMLElement} */ (entry.target);
			if (!el.dataset.path) continue;

			const bcr = entry.boundingClientRect;
			const in_viewport =
				entry.isIntersecting &&
				bcr.bottom > 0 &&
				bcr.top < vh &&
				bcr.right > 0 &&
				bcr.left < vw;
			const cl = el.classList;
			cl.toggle('in-view', in_viewport);
			if (in_viewport) {
				cl.add('seen');
				const visible_w = Math.min(bcr.right, vw) - Math.max(bcr.left, 0);
				const visible_h = Math.min(bcr.bottom, vh) - Math.max(bcr.top, 0);
				const area = bcr.width * bcr.height;
				const ratio = area > 0 ? (visible_w * visible_h) / area : 0;
				cl.toggle('fully-in-view', ratio > 0.98);
				cl.toggle('visible-top', bcr.bottom > vh + 0.5);
				cl.toggle('visible-bottom', bcr.top < -0.5);
			} else {
				cl.remove('fully-in-view', 'visible-top', 'visible-bottom');
			}
		}
	}

	/**
	 * @param {DOMRectReadOnly} bcr
	 * @param {DOMRectReadOnly} ir
	 */
	#clip_bits(bcr, ir) {
		const leading = ir.top > bcr.top + 0.5 || ir.left > bcr.left + 0.5 ? 0b01 : 0;
		const trailing = ir.bottom < bcr.bottom - 0.5 || ir.right < bcr.right - 0.5 ? 0b10 : 0;
		return leading | trailing;
	}
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
	svedit.visibility_registry = registry;

	$effect(() => {
		if (typeof window === 'undefined') return;

		registry.start();
		// Observe every existing node. NO getBoundingClientRect — it
		// would force layout on each call, and at 2000+ nodes the
		// bootstrap interleaves with Svelte's mount work, retriggering
		// layout for the growing DOM (~1.5 s of forced reflow when
		// traced). IO populates near_map / array_indices / clip_map on
		// its first callback, ~1 frame after observe(). The lag is
		// invisible: un-positioned NodeGaps have zero layout presence.
		for (const el of document.querySelectorAll(NODE_SELECTOR)) {
			registry.observe(/** @type {HTMLElement} */ (el));
		}

		const canvas =
			untrack(() => svedit.canvas_el) || document.querySelector('.svedit-canvas');
		/** @type {MutationObserver | null} */
		let mo = null;
		let raf = 0;

		if (canvas) {
			mo = new MutationObserver((mutations) => {
				// Pass 1: observe new nodes / unobserve removed ones.
				// No getBoundingClientRect — IO will populate near/clip
				// state on its first callback. The brief lag between
				// node insert and .positioned activation is invisible
				// because un-positioned NodeGaps have zero layout presence.
				for (const m of mutations) {
					for (const added of m.addedNodes) {
						if (added.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (added);
						if (el.matches?.(NODE_SELECTOR)) registry.observe(el);
						for (const child of el.querySelectorAll?.(NODE_SELECTOR) ?? []) {
							registry.observe(/** @type {HTMLElement} */ (child));
						}
					}
					for (const removed of m.removedNodes) {
						if (removed.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (removed);
						if (el.matches?.(NODE_SELECTOR)) registry.unobserve(el);
						for (const child of el.querySelectorAll?.(NODE_SELECTOR) ?? []) {
							registry.unobserve(/** @type {HTMLElement} */ (child));
						}
					}
				}
				// Pass 2: any newly-mounted .node-gap (e.g. count grew →
				// new mid gap inserted next to an already-visible node)
				// gets its .positioned set to current state. The IO
				// won't fire for the EXISTING adjacent node (its
				// intersection didn't change), so the new gap would
				// otherwise stay un-positioned until the next scroll.
				for (const m of mutations) {
					for (const added of m.addedNodes) {
						if (added.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (added);
						if (el.matches?.(GAP_SELECTOR)) registry.sync_gap_class(el);
						for (const child of el.querySelectorAll?.(GAP_SELECTOR) ?? []) {
							registry.sync_gap_class(child);
						}
					}
				}
			});
			// Defer one frame to skip the initial Svelte mount burst,
			// which the bootstrap above already covered.
			raf = requestAnimationFrame(() => {
				mo.observe(canvas, { childList: true, subtree: true });
			});
		}

		return () => {
			cancelAnimationFrame(raf);
			mo?.disconnect();
			registry.stop();
		};
	});
}

/**
 * Non-reactive visibility check used by the imperative .positioned
 * toggle. Reads near_map / clip_map directly without going through
 * SvelteMap's per-key tracking — we only call this from the IO/MO
 * callbacks and the bootstrap, never from a $derived. `is_last` and
 * `empty` come from the gap element's classList, so we don't need
 * `count` here.
 *
 * @param {VisibilityRegistry} registry
 * @param {string} array_path_str
 * @param {number} offset
 * @param {boolean} is_last
 * @param {boolean} empty
 */
function should_position_gap_imperative(registry, array_path_str, offset, is_last, empty) {
	if (!registry) return false;

	if (empty) {
		return registry.near_map.has(`${array_path_str}.0`);
	}

	if (offset === 0) {
		if (!registry.near_map.has(`${array_path_str}.0`)) return false;
		return ((registry.clip_map.get(`${array_path_str}.0`) ?? 0) & 0b01) === 0;
	}

	if (is_last) {
		const last = offset - 1;
		if (!registry.near_map.has(`${array_path_str}.${last}`)) return false;
		return ((registry.clip_map.get(`${array_path_str}.${last}`) ?? 0) & 0b10) === 0;
	}

	return (
		registry.near_map.has(`${array_path_str}.${offset - 1}`) &&
		registry.near_map.has(`${array_path_str}.${offset}`)
	);
}
