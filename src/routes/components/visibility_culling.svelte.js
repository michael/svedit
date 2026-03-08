/**
 * IntersectionObserver-based visibility culling for node arrays.
 *
 * Tracks which nodes are near the viewport and exposes the data as
 * reactive state. Import and call `create_visibility_culler(svedit)`
 * inside a component to activate; omit the import to disable culling.
 *
 * @module
 */

const VIEWPORT_OVERSCAN_PX = 600;
const NODE_SELECTOR = '[data-type="node"][data-path]';

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
 * Create visibility culler that tracks which node-array children are
 * near the viewport using IntersectionObserver.
 *
 * Must be called during component initialization (needs rune context).
 *
 * @param {object} svedit - The svedit context object.
 * @param {{ overscan?: number }} [options]
 * @returns {{
 *   readonly visible_child_indices: Map<string, Set<number>>,
 *   readonly doc_snapshot: object | null
 * }}
 */
export function create_visibility_culler(svedit, options = {}) {
	const overscan = options.overscan ?? VIEWPORT_OVERSCAN_PX;

	/** @type {Map<string, Set<number>>} */
	let visible_child_indices = $state.raw(new Map());
	let doc_snapshot = $state.raw(null);

	$effect(() => {
		const doc = svedit.session.doc;

		if (!svedit.editable) {
			visible_child_indices = new Map();
			doc_snapshot = null;
			return;
		}

		/** @type {Map<string, Set<number>>} */
		const index_map = new Map(); // eslint-disable-line svelte/prefer-svelte-reactivity

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
					doc_snapshot = doc;
				}
			},
			{ rootMargin: `${overscan}px` }
		);

		for (const el of document.querySelectorAll(NODE_SELECTOR)) {
			const node_el = /** @type {HTMLElement} */ (el);
			const parsed = parse_node_path(node_el.dataset.path);
			if (!parsed) continue;

			const rect = node_el.getBoundingClientRect();
			if (
				rect.bottom >= -overscan &&
				rect.top <= window.innerHeight + overscan &&
				rect.right >= -overscan &&
				rect.left <= window.innerWidth + overscan
			) {
				let set = index_map.get(parsed.array_path);
				if (!set) index_map.set(parsed.array_path, set = new Set()); // eslint-disable-line svelte/prefer-svelte-reactivity
				set.add(parsed.child_index);
			}

			observer.observe(node_el);
		}

		visible_child_indices = new Map(index_map);
		doc_snapshot = doc;
		return () => observer.disconnect();
	});

	return {
		get visible_child_indices() { return visible_child_indices; },
		get doc_snapshot() { return doc_snapshot; }
	};
}
