/**
 * IntersectionObserver-based visibility culling for node arrays.
 *
 * ## Why this exists
 *
 * Without culling, every node in the document produces insertion gap
 * markers (via NodeInsertionOverlay) and CSS-anchor-positioned cursor
 * traps (via NodeCursorTrap). Both are expensive: gap markers grow at
 * O(N) with document size, and each cursor trap triggers layout work
 * for its anchor positioning. At ~200+ nodes, this causes noticeable
 * frame drops during scroll and resize; at 500+ it's unusable.
 *
 * Culling solves this by tracking which root-level nodes are within
 * or near the viewport, so only ~10–20 nodes (regardless of document
 * size) participate in gap computation and cursor trap rendering.
 *
 * ## Architecture
 *
 * Only **root-level** node_array children are observed (e.g. the
 * direct children of `page.body`). Nested node_arrays (e.g. buttons
 * inside a story, list items inside a list) are small and have their
 * visibility inferred from their root ancestor — no per-element IO
 * tracking needed. This keeps the IntersectionObserver budget small.
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
 * A single debounced **version counter** drives both cursor trap
 * visibility (`is_near_viewport`) and gap marker computation
 * (`visible_child_indices`). A plain `Set<string>` tracks which root
 * keys are near the viewport; `is_near_viewport` reads `version`
 * (reactive dependency) then does a non-reactive `Set.has()` lookup.
 *
 * The 20ms debounce coalesces rapid IO callbacks into a single reactive
 * version bump, preventing redundant O(N) `$derived` re-evaluations
 * (~53ms total overlay latency ≈ 3 frames at 60fps). On initial mount,
 * the `$effect` bumps `version` immediately (no debounce); Svelte
 * flushes effects before the first browser paint so overlays appear
 * with zero flash.
 *
 * @module
 */

/**
 * Overscan margin around the viewport (px). Nodes within this distance
 * of the viewport are pre-tracked so overlays are ready before they
 * scroll into view. 500px provides enough buffer for fast scrolling
 * (~8000px/s) while adding only 3 extra gap markers vs e.g. 250px — no
 * measurable FPS impact at ≤1000 nodes.
 *
 * Tested values: 250 / 500 / 1000 / 2000. Higher values increase
 * gap marker count and degrade scroll FPS at 6000+ nodes.
 */
const DEFAULT_OVERSCAN_PX = 500;

const NODE_SELECTOR = '[data-type="node"][data-path]';

/**
 * Cap on synchronous getBoundingClientRect calls during initial setup.
 * Calling gBCR for every node in a 500+ node document would cause a
 * significant layout thrash. By capping at 30, we get instant visibility
 * data for above-the-fold content and let the IO handle the rest async.
 */
const MAX_SYNC_CHECKS = 30;

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
 * Root-level array children have paths with exactly 2 dots
 * (e.g. "page_1.body.0"). Deeper nodes (e.g. "page_1.body.5.buttons.0")
 * have 4+ dots and are skipped — their visibility is inferred from
 * their root ancestor being visible.
 *
 * This is the key insight that makes the IO budget manageable: in a
 * 500-node document with 2 levels of nesting, only ~100 root nodes
 * are observed rather than all 500.
 *
 * @param {string} path_str
 * @returns {boolean}
 */
function is_root_array_child(path_str) {
	let dots = 0;
	for (let i = 0; i < path_str.length; i++) {
		if (path_str[i] === '.' && ++dots > 2) return false;
	}
	return dots === 2;
}

/**
 * @param {object} svedit
 * @returns {{
 *   readonly visible_child_indices: Map<string, Set<number>>,
 *   readonly doc_snapshot: object | null,
 *   is_near_viewport: (path: Array<string|number>) => boolean
 * }}
 */
export function create_visibility_culler(svedit) {

	/** @type {Map<string, Set<number>>} */
	const index_map = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity
	/**
	 * Read-optimized index for is_near_viewport (called 1000× per version
	 * bump). A single Set.has(string) is faster than Map.get + Set.has.
	 * @type {Set<string>}
	 */
	const visible_roots = new Set(); // eslint-disable-line svelte/prefer-svelte-reactivity

	let _ver = 0;
	let version = $state.raw(0);
	let doc_snapshot = $state.raw(null);
	let version_timer = 0;

	/**
	 * Shared IntersectionObserver callback. Mutates index_map and
	 * visible_roots in place, then debounces the reactive version bump.
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

			if (entry.isIntersecting) {
				visible_roots.add(path);
				let set = index_map.get(parsed.array_path);
				if (!set) index_map.set(parsed.array_path, set = new Set()); // eslint-disable-line svelte/prefer-svelte-reactivity
				if (!set.has(parsed.child_index)) {
					set.add(parsed.child_index);
					did_change = true;
				}
			} else {
				visible_roots.delete(path);
				const set = index_map.get(parsed.array_path);
				if (set && set.delete(parsed.child_index)) {
					did_change = true;
					if (set.size === 0) index_map.delete(parsed.array_path);
				}
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
	 * Query existing DOM nodes, observe root-level ones with the IO,
	 * and sync-check the first batch for instant initial visibility.
	 *
	 * The sync check (getBoundingClientRect) ensures above-the-fold nodes
	 * are marked visible immediately, without waiting for the async IO
	 * callback. Capped at MAX_SYNC_CHECKS to avoid layout thrashing in
	 * large documents — the IO handles the rest asynchronously.
	 *
	 * @param {IntersectionObserver} io
	 */
	function setup_observation(io) {
		const vh = window.innerHeight;
		const vw = window.innerWidth;
		let sync_checked = 0;

		for (const el of document.querySelectorAll(NODE_SELECTOR)) {
			const node_el = /** @type {HTMLElement} */ (el);
			const path = node_el.dataset.path;
			if (!path || !is_root_array_child(path)) continue;

			io.observe(node_el);

			if (sync_checked < MAX_SYNC_CHECKS) {
				const parsed = parse_node_path(path);
				if (parsed) {
					const rect = node_el.getBoundingClientRect();
					const visible =
						rect.bottom >= -DEFAULT_OVERSCAN_PX &&
						rect.top <= vh + DEFAULT_OVERSCAN_PX &&
						rect.right >= -DEFAULT_OVERSCAN_PX &&
						rect.left <= vw + DEFAULT_OVERSCAN_PX;
					if (visible) {
						visible_roots.add(path);
						let set = index_map.get(parsed.array_path);
						if (!set) index_map.set(parsed.array_path, set = new Set()); // eslint-disable-line svelte/prefer-svelte-reactivity
						set.add(parsed.child_index);
					}
				}
				sync_checked++;
			}
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
			version = ++_ver;
			doc_snapshot = null;
			return;
		}

		index_map.clear();

		const io = new IntersectionObserver(process_entries, {
			rootMargin: `${DEFAULT_OVERSCAN_PX}px`
		});

		setup_observation(io);
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
				for (const m of mutations) {
					for (const added of m.addedNodes) {
						if (added.nodeType !== Node.ELEMENT_NODE) continue;
						const el = /** @type {HTMLElement} */ (added);
						if (el.matches?.(NODE_SELECTOR) && is_root_array_child(el.dataset.path)) {
							io.observe(el);
						}
						for (const child of el.querySelectorAll?.(NODE_SELECTOR) ?? []) {
							const child_el = /** @type {HTMLElement} */ (child);
							if (is_root_array_child(child_el.dataset.path)) {
								io.observe(child_el);
							}
						}
					}
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
			visible_roots.clear();
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
	 * Viewport proximity check. Reads `version` (debounced 30ms) then
	 * does a non-reactive Set.has() lookup. On initial mount, version
	 * is bumped immediately (no debounce) so overlays appear in the
	 * first paint.
	 *
	 * @param {Array<string|number>} path
	 * @returns {boolean}
	 */
	function is_near_viewport(path) {
		if (path.length < 3) return true;
		void version;
		const root_key = `${path[0]}.${path[1]}.${path[2]}`;
		return visible_roots.has(root_key);
	}

	return {
		get visible_child_indices() { version; return index_map; },
		get doc_snapshot() { return doc_snapshot; },
		is_near_viewport
	};
}
