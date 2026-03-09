<script>
	import { getContext } from 'svelte';
	import { create_visibility_culler } from './visibility_culling.svelte.js';

	/**
	 * Data-only gap computation for node-array editing.
	 *
	 * Computes insertion gap markers for all node arrays and publishes
	 * the results to the svedit context via reactive getters. Rendering is
	 * handled by NodeInsertionMarkers.svelte inside each NodeArrayProperty.
	 *
	 * This component has no DOM output.
	 *
	 * The culler tracks viewport-visible root nodes via IntersectionObserver,
	 * limiting gap markers to ~10-15 regardless of document size. For small
	 * documents the IO simply observes all nodes — negligible overhead.
	 *
	 * Cursor trap visibility uses the culler's debounced version counter.
	 * Node.svelte's {#if is_near_viewport} keeps only limited number of cursor traps
	 * in the DOM regardless of document size.
	 */

	const svedit = getContext('svedit');

	const culler = create_visibility_culler(svedit);

	svedit.is_near_viewport = culler.is_near_viewport;

	let cursor_gap_key = $derived.by(() => {
		const s = svedit.session.selection;
		if (s?.type !== 'node' || s.anchor_offset !== s.focus_offset) return null;
		return `${s.path.join('.')}-gap-${s.anchor_offset}`;
	});

	/**
	 * Per-path reactive gap data. Each NodeInsertionMarkers instance
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
	// so NodeInsertionMarkers sees fresh data in the same render pass.
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
		get cursor_gap_key() { return cursor_gap_key; }
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

		return by_path;
	}

	/**
	 * Walk a visible node's schema to find nested node_arrays and add
	 * full (unculled) gaps for them. Recurses into nested children.
	 * @param {string} array_path_str
	 * @param {number} child_index
	 * @param {Map<string, Array<gap_t>>} by_path
	 */
	function collect_nested_array_gaps(array_path_str, child_index, by_path) {
		const array_path = array_path_str.split('.');
		const node_ids = svedit.session.get(array_path);
		if (!Array.isArray(node_ids) || child_index >= node_ids.length) return;

		const node_id = node_ids[child_index];
		const node = svedit.session.doc.nodes[node_id];
		if (!node) return;

		const type_def = svedit.session.schema[node.type];
		if (!type_def?.properties) return;

		const node_path_str = `${array_path_str}.${child_index}`;

		for (const [prop_name, prop_def] of Object.entries(type_def.properties)) {
			if (prop_def.type !== 'node_array') continue;

			const nested_path_str = `${node_path_str}.${prop_name}`;
			if (by_path.has(nested_path_str)) continue;

			const ids = node[prop_name] || [];
			const gaps = emit_gaps(nested_path_str, nested_path_str.split('.'), ids.length, () => true);
			if (gaps.length > 0) by_path.set(nested_path_str, gaps);

			for (let i = 0; i < ids.length; i++) {
				collect_nested_array_gaps(nested_path_str, i, by_path);
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
		const ct_prefix = `--ct-${array_path.join('-')}`;
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
				vars: `--_ct:${ct_prefix}-0-position-zero-cursor-trap;--_a:${anchor_prefix}-0${container_var}`,
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
			const ct_anchor = offset === 0
				? `${ct_prefix}-0-position-zero-cursor-trap`
				: `${ct_prefix}-${offset - 1}-after-node-cursor-trap`;

			let type, vars;

			if (is_first || is_last) {
				type = 'gap-edge';
				const adjacent = is_first
					? `${anchor_prefix}-0`
					: `${anchor_prefix}-${count - 1}`;
				vars = `--_ct:${ct_anchor};--_a:${adjacent}${container_var}${pair_vars}`;
			} else {
				type = 'gap-mid';
				const p_anchor = `${anchor_prefix}-${offset - 1}`;
				const n_anchor = `${anchor_prefix}-${offset}`;
				vars = `--_ct:${ct_anchor};--_p:${p_anchor};--_n:${n_anchor}${container_var}${pair_vars}`;
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
</script>
