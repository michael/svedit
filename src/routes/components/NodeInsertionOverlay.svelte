<script>
	import { getContext } from 'svelte';

	/**
	 * Data-only gap computation for node-array editing.
	 *
	 * Computes insertion gap markers for all visible node arrays and publishes
	 * the results to the svedit context via reactive getters. Rendering is
	 * handled by NodeInsertionMarkers.svelte inside each NodeArrayProperty.
	 *
	 * This component has no DOM output.
	 */

	// -----------------------------------------------------------------------------
	// constants
	// -----------------------------------------------------------------------------

	/** Set to false to disable IntersectionObserver culling (renders gaps for all node arrays). */
	const ENABLE_VISIBILITY_CULLING = false;
	const VIEWPORT_OVERSCAN_PX = 600;
	const NODE_SELECTOR = '[data-type="node"][data-path]';

	// -----------------------------------------------------------------------------
	// context and reactive state
	// -----------------------------------------------------------------------------

	const svedit = getContext('svedit');

	let cursor_gap_key = $derived.by(() => {
		const s = svedit.session.selection;
		if (s?.type !== 'node' || s.anchor_offset !== s.focus_offset) return null;
		return `${s.path.join('.')}-gap-${s.anchor_offset}`;
	});

	/**
	 * When culling is enabled, maps array_path → set of visible child indices.
	 * Populated by IntersectionObserver. Unused when culling is off.
	 * @type {Map<string, Set<number>>}
	 */
	let visible_child_indices = $state.raw(new Map());
	let visible_paths_doc = $state.raw(null);

	let gaps_by_path = $derived(build_all_gaps());

	// -----------------------------------------------------------------------------
	// expose reactive data to markers (no $effect — direct signal chain)
	// -----------------------------------------------------------------------------

	svedit.insertion_gap_data = {
		get gaps_by_path() { return gaps_by_path; },
		get cursor_gap_key() { return cursor_gap_key; }
	};

	// -----------------------------------------------------------------------------
	// visibility culling (IntersectionObserver) — only when enabled
	// -----------------------------------------------------------------------------

	if (ENABLE_VISIBILITY_CULLING) {
		$effect(() => {
			const doc_snapshot = svedit.session.doc;

			if (!svedit.editable) {
				visible_child_indices = new Map();
				visible_paths_doc = null;
				return;
			}

			/** @type {Map<string, Set<number>>} */
			const index_map = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity -- plain Map, never assigned to reactive state directly

			const observer = new IntersectionObserver(
				(entries) => {
					let did_change = false;
					for (const entry of entries) {
						const path = /** @type {HTMLElement} */ (entry.target).dataset.path;
						if (!path) continue;
						const parsed = parse_node_path(path);
						if (!parsed) continue;

						if (entry.isIntersecting) {
							let set = index_map.get(parsed.array_path);
							if (!set) index_map.set(parsed.array_path, set = new Set()); // eslint-disable-line svelte/prefer-svelte-reactivity
							if (!set.has(parsed.child_index)) {
								set.add(parsed.child_index);
								did_change = true;
							}
						} else {
							const set = index_map.get(parsed.array_path);
							if (set && set.delete(parsed.child_index)) {
								did_change = true;
								if (set.size === 0) index_map.delete(parsed.array_path);
							}
						}
					}
					if (did_change) {
						visible_child_indices = new Map(index_map);
						visible_paths_doc = doc_snapshot;
					}
				},
				{ rootMargin: `${VIEWPORT_OVERSCAN_PX}px` }
			);

			for (const el of document.querySelectorAll(NODE_SELECTOR)) {
				const node_el = /** @type {HTMLElement} */ (el);
				const parsed = parse_node_path(node_el.dataset.path);
				if (!parsed) continue;

				const rect = node_el.getBoundingClientRect();
				if (
					rect.bottom >= -VIEWPORT_OVERSCAN_PX &&
					rect.top <= window.innerHeight + VIEWPORT_OVERSCAN_PX &&
					rect.right >= -VIEWPORT_OVERSCAN_PX &&
					rect.left <= window.innerWidth + VIEWPORT_OVERSCAN_PX
				) {
					let set = index_map.get(parsed.array_path);
					if (!set) index_map.set(parsed.array_path, set = new Set()); // eslint-disable-line svelte/prefer-svelte-reactivity
					set.add(parsed.child_index);
				}

				observer.observe(node_el);
			}

			visible_child_indices = new Map(index_map);
			visible_paths_doc = doc_snapshot;
			return () => observer.disconnect();
		});
	}

	// -----------------------------------------------------------------------------
	// helpers
	// -----------------------------------------------------------------------------

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

		if (ENABLE_VISIBILITY_CULLING) {
			if (visible_paths_doc !== svedit.session.doc) return by_path;
			for (const [path_str, indices] of visible_child_indices) {
				const gaps = build_array_gaps(path_str, indices);
				if (gaps.length > 0) by_path.set(path_str, gaps);
			}
		} else {
			for (const [path_str, count] of collect_all_node_arrays()) {
				const gaps = build_array_gaps_all(path_str, count);
				if (gaps.length > 0) by_path.set(path_str, gaps);
			}
		}

		return by_path;
	}

	/**
	 * Build gaps for a node_array, only for visible indices (culled path).
	 * @param {string} array_path_str
	 * @param {Set<number>} visible_indices
	 * @returns {Array<gap_t>}
	 */
	function build_array_gaps(array_path_str, visible_indices) {
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
	function build_array_gaps_all(array_path_str, count) {
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
