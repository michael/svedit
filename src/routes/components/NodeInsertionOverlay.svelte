<script>
	import { getContext } from 'svelte';
	// Uncomment to enable IntersectionObserver visibility culling:
	// import { create_visibility_culler } from './visibility_culling.svelte.js';

	/**
	 * Data-only gap computation for node-array editing.
	 *
	 * Computes insertion gap markers for all node arrays and publishes
	 * the results to the svedit context via reactive getters. Rendering is
	 * handled by NodeInsertionMarkers.svelte inside each NodeArrayProperty.
	 *
	 * This component has no DOM output.
	 *
	 * Visibility culling (IntersectionObserver) is opt-in: import and
	 * activate `create_visibility_culler` to only compute gaps for
	 * node arrays near the viewport.
	 */

	const svedit = getContext('svedit');

	// Uncomment to enable IntersectionObserver visibility culling:
	// const culler = create_visibility_culler(svedit);
	const culler = null;

	let cursor_gap_key = $derived.by(() => {
		const s = svedit.session.selection;
		if (s?.type !== 'node' || s.anchor_offset !== s.focus_offset) return null;
		return `${s.path.join('.')}-gap-${s.anchor_offset}`;
	});

	let gaps_by_path = $derived(build_all_gaps());

	svedit.insertion_gap_data = {
		get gaps_by_path() { return gaps_by_path; },
		get cursor_gap_key() { return cursor_gap_key; }
	};

	// -----------------------------------------------------------------------------
	// helpers
	// -----------------------------------------------------------------------------

	/**
	 * Walk the document model to collect all node_array paths and their child counts.
	 * Pure data — no DOM access.
	 * @returns {Map<string, number>}
	 */
	function collect_all_node_arrays() {
		const { schema, doc } = svedit.session;
		/** @type {Map<string, number>} */
		const result = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity
		const visited = new Set(); // eslint-disable-line svelte/prefer-svelte-reactivity

		/** @param {string} node_id  @param {Array<string|number>} base_path */
		function visit(node_id, base_path) {
			if (!node_id || visited.has(node_id)) return;
			visited.add(node_id);
			const node = doc.nodes[node_id];
			if (!node) return;
			const type_def = schema[node.type];
			if (!type_def?.properties) return;

			for (const [prop_name, prop_def] of Object.entries(type_def.properties)) {
				if (prop_def.type === 'node_array') {
					const arr_path = [...base_path, prop_name];
					const ids = node[prop_name] || [];
					result.set(arr_path.join('.'), ids.length);
					for (let i = 0; i < ids.length; i++) visit(ids[i], [...arr_path, i]);
				} else if (prop_def.type === 'node') {
					if (node[prop_name]) visit(node[prop_name], [...base_path, prop_name]);
				}
			}
		}

		visit(doc.document_id, [doc.document_id]);
		return result;
	}

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

		if (culler) {
			if (culler.doc_snapshot !== svedit.session.doc) return by_path;
			for (const [path_str, indices] of culler.visible_child_indices) {
				const gaps = build_array_gaps_culled(path_str, indices);
				if (gaps.length > 0) by_path.set(path_str, gaps);
			}
		} else {
			for (const [path_str, count] of collect_all_node_arrays()) {
				const gaps = build_array_gaps(path_str, count);
				if (gaps.length > 0) by_path.set(path_str, gaps);
			}
		}

		return by_path;
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
	 * Build gaps for a node_array, all offsets (unculled path).
	 * @param {string} array_path_str
	 * @param {number} count
	 * @returns {Array<gap_t>}
	 */
	function build_array_gaps(array_path_str, count) {
		return emit_gaps(array_path_str, array_path_str.split('.'), count, () => true);
	}

	/**
	 * Core gap emitter shared by culled and unculled paths.
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
