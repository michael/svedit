/**
 * Single-observer viewport visibility tracking for node arrays.
 *
 * Replaces the dual-IO + dual-MO + hand-rolled cache architecture in
 * the previous node_gap_computation. One IntersectionObserver, one
 * MutationObserver, native SvelteMap/SvelteSet fine-grained reactivity.
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
 * ## Single observer, dual-purpose
 *
 * One IntersectionObserver with `rootMargin: 500px` does triple duty:
 *
 * 1. **near_map** — entry.isIntersecting is true for the rootMargin'd
 *    overscan zone. Drives `.positioned` activation on adjacent gaps.
 * 2. **viewport state** — computed from boundingClientRect vs window
 *    dimensions (independent of rootMargin). Drives `.in-view`,
 *    `.fully-in-view`, `.visible-top`, `.visible-bottom`, `.seen`.
 * 3. **clip_map** — computed from intersectionRect vs boundingClientRect
 *    for nested-scroller edge clip detection.
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

	start() {
		if (typeof window === 'undefined' || this.#io) return;
		this.#io = new IntersectionObserver((entries) => this.#process(entries), {
			rootMargin: `${OVERSCAN_PX}px`,
			threshold: [0, 0.98]
		});
	}

	stop() {
		this.#io?.disconnect();
		this.#io = null;
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
	}

	/** @param {HTMLElement} el */
	unobserve(el) {
		this.#io?.unobserve(el);
		const path = el.dataset?.path;
		if (path) this.#forget(path);
	}

	/**
	 * Synchronously fill near_map / array_indices from an element's bcr.
	 * Used for initial bootstrap and for nodes added by Svelte (so the
	 * first render after a node insertion has correct .positioned state
	 * without waiting one frame for the IO callback).
	 *
	 * @param {HTMLElement} el
	 * @param {number} vh
	 * @param {number} vw
	 */
	sync_fill_if_near(el, vh, vw) {
		const path = el.dataset?.path;
		if (!path || this.near_map.has(path)) return;
		const r = el.getBoundingClientRect();
		if (
			r.top > vh + OVERSCAN_PX ||
			r.bottom < -OVERSCAN_PX ||
			r.right < -OVERSCAN_PX ||
			r.left > vw + OVERSCAN_PX
		) return;
		this.near_map.set(path, true);
		const split = this.#split_path(path);
		if (split) this.get_array_indices(split.array_path).add(split.index);
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

	/** @param {IntersectionObserverEntry[]} entries */
	#process(entries) {
		const vh = window.innerHeight;
		const vw = window.innerWidth;

		for (const entry of entries) {
			const el = /** @type {HTMLElement} */ (entry.target);
			const path = el.dataset.path;
			if (!path) continue;

			const is_near = entry.isIntersecting;
			const bcr = entry.boundingClientRect;
			const ir = entry.intersectionRect;

			// near_map (overscan zone)
			if (is_near) {
				if (!this.near_map.has(path)) this.near_map.set(path, true);
			} else if (this.near_map.has(path)) {
				this.near_map.delete(path);
			}

			// array_indices (per-array index set)
			const split = this.#split_path(path);
			if (split) {
				const set = this.get_array_indices(split.array_path);
				if (is_near) set.add(split.index);
				else set.delete(split.index);
			}

			// clip_map (nested-scroller edge clip)
			const new_bits = is_near ? this.#clip_bits(bcr, ir) : 0b11;
			const old_bits = this.clip_map.get(path) ?? 0;
			if (new_bits !== old_bits) {
				if (new_bits === 0 || new_bits === 0b11) this.clip_map.delete(path);
				else this.clip_map.set(path, new_bits);
			}

			// View classes — pure DOM ops, no Svelte consumers.
			// Computed from bcr vs viewport (independent of rootMargin),
			// so semantics match the original separate view IO.
			const in_viewport =
				is_near &&
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
	svedit.visibility_registry = registry;

	$effect(() => {
		if (typeof window === 'undefined') return;

		// The whole setup must run untracked: the bootstrap reads near_map.has()
		// to skip duplicates AND writes near_map.set() — without untrack the
		// effect would track its own writes and re-fire forever (Svelte's
		// effect_update_depth_exceeded). Same applies to canvas_el access.
		untrack(() => {
			registry.start();

			const vh = window.innerHeight;
			const vw = window.innerWidth;
			for (const el of document.querySelectorAll(NODE_SELECTOR)) {
				const node_el = /** @type {HTMLElement} */ (el);
				registry.observe(node_el);
				registry.sync_fill_if_near(node_el, vh, vw);
			}
		});

		const canvas =
			untrack(() => svedit.canvas_el) || document.querySelector('.svedit-canvas');
		/** @type {MutationObserver | null} */
		let mo = null;
		let raf = 0;

		if (canvas) {
			mo = new MutationObserver((mutations) => {
				const _vh = window.innerHeight;
				const _vw = window.innerWidth;
				for (const m of mutations) {
					for (const added of m.addedNodes) {
						if (added.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (added);
						if (el.matches?.(NODE_SELECTOR)) {
							registry.observe(el);
							registry.sync_fill_if_near(el, _vh, _vw);
						}
						for (const child of el.querySelectorAll?.(NODE_SELECTOR) ?? []) {
							const child_el = /** @type {HTMLElement} */ (child);
							registry.observe(child_el);
							registry.sync_fill_if_near(child_el, _vh, _vw);
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
 * Pure visibility check used by NodeGap to decide whether to render
 * with `.positioned` (anchor positioning active) or as a zero-size
 * absolute element with no layout cost.
 *
 * Reads near_map and clip_map via SvelteMap fine-grained tracking, so
 * the calling $derived only re-evaluates when the relevant keys change.
 *
 * @param {VisibilityRegistry} registry
 * @param {string} array_path_str
 * @param {number} offset
 * @param {number} count
 * @param {boolean} empty
 */
export function should_position_gap(registry, array_path_str, offset, count, empty) {
	if (!registry) return false;
	const set = registry.get_array_indices(array_path_str);

	if (empty || count === 0) {
		if (!set.has(0)) return false;
		const c = registry.clip_map.get(`${array_path_str}.0`) ?? 0;
		return (c & 0b11) !== 0b11;
	}

	if (offset === 0) {
		if (!set.has(0)) return false;
		return ((registry.clip_map.get(`${array_path_str}.0`) ?? 0) & 0b01) === 0;
	}

	if (offset === count) {
		const last = offset - 1;
		if (!set.has(last)) return false;
		return ((registry.clip_map.get(`${array_path_str}.${last}`) ?? 0) & 0b10) === 0;
	}

	return set.has(offset - 1) && set.has(offset);
}
