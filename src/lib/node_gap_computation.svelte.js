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
 * A single debounced **version counter** drives both node gap
 * positioning (`is_near_viewport`) and gap marker computation
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
function create_visibility_culler(svedit) {

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
	 * Viewport proximity check driving lazy anchor positioning.
	 * NodeGap elements are always in the DOM; this determines whether
	 * the expensive CSS anchor positioning is activated (positioned
	 * prop). Reads `version` (debounced 20ms) then does a non-reactive
	 * Set.has() lookup. On initial mount, version is bumped immediately
	 * (no debounce) so overlays appear in the first paint.
	 *
	 * @param {Array<string|number>} path
	 * @returns {boolean}
	 */
	function is_near_viewport(path) {
		if (path.length < 3) return true;
		void version;
		// Content under non-tracked arrays is always visible — only the main body array is large enough to cull.
		const parent_array = `${path[0]}.${path[1]}`;
		if (!index_map.has(parent_array)) return true;
		const root_key = `${path[0]}.${path[1]}.${path[2]}`;
		return visible_roots.has(root_key);
	}

	return {
		get visible_child_indices() { version; return index_map; },
		get doc_snapshot() { return doc_snapshot; },
		is_near_viewport
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

	// Distribute gap data to per-path signals. Runs before DOM updates
	// so NodeGapMarkers sees fresh data in the same render pass.
	$effect.pre(() => {
		const new_gaps = build_all_gaps();
		const seen = new Set(); // eslint-disable-line svelte/prefer-svelte-reactivity
		for (const [path_str, gaps] of new_gaps) {
			seen.add(path_str);
			get_or_create_gap_signal(path_str).gaps = gaps;
		}
		for (const [path_str, sig] of path_gap_signals) {
			if (!seen.has(path_str) && sig.gaps.length > 0) {
				sig.gaps = [];
			}
		}
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

		// Wait until the culler's visibility snapshot matches the current doc.
		// During the brief gap between a doc mutation and the next IO callback,
		// the snapshot is stale — return empty to avoid computing gaps against
		// outdated visibility data. The IO fires within one frame.
		if (culler.doc_snapshot !== svedit.session.doc) return by_path;

		// Build culled gaps for root-level arrays (only near-viewport children)
		for (const [path_str, indices] of culler.visible_child_indices) {
			const gaps = build_array_gaps_culled(path_str, indices);
			if (gaps.length > 0) by_path.set(path_str, gaps);

			// Walk visible root nodes to find nested node_arrays (e.g.
			// buttons inside a story) and emit full gaps for them.
			for (const child_idx of indices) {
				collect_nested_array_gaps(path_str, child_idx, by_path);
			}
		}

		// Walk the document root's `node` type properties (e.g. page.nav,
		// page.footer) which aren't children of any node_array and thus
		// aren't reached by the culler's visible_child_indices traversal.
		const doc_id = svedit.session.document_id;
		const doc_node = svedit.session.doc.nodes[doc_id];
		if (doc_node) {
			const doc_type_def = svedit.session.schema[doc_node.type];
			if (doc_type_def?.properties) {
				for (const [prop_name, prop_def] of Object.entries(doc_type_def.properties)) {
					if (prop_def.type === 'node' && doc_node[prop_name]) {
						collect_node_gaps(`${doc_id}.${prop_name}`, doc_node[prop_name], by_path);
					}
				}
			}
		}

		return by_path;
	}

	/**
	 * Walk a visible node's schema to find nested node_arrays and add
	 * full (unculled) gaps for them. Recurses into node_array children
	 * and single node references (e.g. page.nav, page.footer).
	 * @param {string} array_path_str
	 * @param {number} child_index
	 * @param {Map<string, Array<gap_t>>} by_path
	 */
	function collect_nested_array_gaps(array_path_str, child_index, by_path) {
		const array_path = array_path_str.split('.');
		const node_ids = svedit.session.get(array_path);
		if (!Array.isArray(node_ids) || child_index >= node_ids.length) return;

		collect_node_gaps(`${array_path_str}.${child_index}`, node_ids[child_index], by_path);
	}

	/**
	 * Walk a single node's properties for node_arrays and node refs.
	 * @param {string} node_path_str
	 * @param {string} node_id
	 * @param {Map<string, Array<gap_t>>} by_path
	 */
	function collect_node_gaps(node_path_str, node_id, by_path) {
		const node = svedit.session.doc.nodes[node_id];
		if (!node) return;

		const type_def = svedit.session.schema[node.type];
		if (!type_def?.properties) return;

		for (const [prop_name, prop_def] of Object.entries(type_def.properties)) {
			const prop_path_str = `${node_path_str}.${prop_name}`;

			if (prop_def.type === 'node') {
				const ref_id = node[prop_name];
				if (ref_id) collect_node_gaps(prop_path_str, ref_id, by_path);
			} else if (prop_def.type === 'node_array') {
				if (by_path.has(prop_path_str)) continue;

				const ids = node[prop_name] || [];
				const gaps = emit_gaps(prop_path_str, prop_path_str.split('.'), ids.length, () => true);
				if (gaps.length > 0) by_path.set(prop_path_str, gaps);

				for (let i = 0; i < ids.length; i++) {
					collect_node_gaps(`${prop_path_str}.${i}`, ids[i], by_path);
				}
			}
		}
	}

	/**
	 * Build gaps for a node_array using visibility filter (culled path).
	 * @param {string} array_path_str
	 * @param {Set<number>} visible_indices
	 * @returns {Array<gap_t>}
	 */
	function build_array_gaps_culled(array_path_str, visible_indices) {
		const array_path = array_path_str.split('.');
		try {
			const info = svedit.session.inspect(array_path);
			if (info.kind !== 'property' || info.type !== 'node_array') return [];
		} catch { return []; }
		const node_ids = svedit.session.get(array_path);
		if (!Array.isArray(node_ids)) return [];

		return emit_gaps(array_path_str, array_path, node_ids.length, (offset, count) => {
			const prev_visible = offset > 0 && visible_indices.has(offset - 1);
			const next_visible = offset < count && visible_indices.has(offset);
			return prev_visible || next_visible;
		});
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
