import { For, Show, createMemo } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import NodeCaret from './NodeCaret.js';
import { PATH_SEPARATOR, serialize_path } from '@svedit/core';
import { use_svedit } from './context.js';
import { class_names } from './solid_utils.js';
import type { AnyComponent, DocumentPath, SveditRenderContext } from './types.js';
import './NodeGapMarkers.css';

/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ MUST RULES — do not violate when modifying this file            │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 1. Edge markers (gap-edge.first / gap-edge.last) MUST render    │
 * │    OUTSIDE the node-array container — they extend into the     │
 * │    whitespace above/below (column) or left/right (row) of the  │
 * │    first/last node. They only clamp inward when the consumer   │
 * │    explicitly opts in via --node-caret-boundary(-x/-y).        │
 * │ 2. Markers MUST NEVER overlap nodes. They render strictly in   │
 * │    the whitespace between nodes (mid markers) or outside the   │
 * │    node array bounds (edge markers). Never on top of a node.  │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Renders insertion gap markers for a single node_array.
 *
 * Lives inside NodeArrayProperty so it inherits the --row CSS variable.
 * Uses var(--row, 1) with the * 9999999 multiplier trick to switch between
 * column and row positioning/visuals in pure CSS — no container queries.
 *
 * Reads visibility state directly from the registry. The reactive set's
 * per-key tracking on `.has()` and iteration means this component only
 * re-evaluates when THIS array's visible-index set changes.
 *
 * The active marker (the one carrying the caret) additionally renders the
 * consumer's `system_components.node_gap_tools` component when configured
 * — an extension point for gap-scoped tools (e.g. an insert button).
 * Rendering inside the marker means the tool inherits --row for
 * orientation-aware styling and shows/hides together with the caret.
 * The marker has pointer-events: none — interactive tools must set
 * pointer-events: auto themselves.
 *
 * The markers are returned as a flat, keyed list (no wrapper element), so
 * they are inserted directly into the node-array container.
 */
type GapMarker = {
	key: string;
	offset: number;
	type: string;
	vars: string;
	is_first: boolean;
	is_last: boolean;
	has_pair: boolean;
};

export type NodeGapMarkersProps = {
	path: DocumentPath;
	count: number;
};

export default function NodeGapMarkers(props: NodeGapMarkersProps) {
	const svedit = use_svedit() as SveditRenderContext;
	const NodeGapTools = createMemo<AnyComponent | undefined>(
		() => svedit.session.config.system_components?.node_gap_tools
	);
	const path_str = createMemo(() => serialize_path(props.path));
	const visible = createMemo(() => svedit.visibility_registry.get_array_indices(path_str()));

	const caret_gap_key = createMemo(() => {
		const s = svedit.session.selection;
		if (s?.type !== 'node' || s.anchor_offset !== s.focus_offset) return null;
		return `${serialize_path(s.path)}-gap-${s.anchor_offset}`;
	});

	const my_gaps = createMemo(() => {
		const registry = svedit.visibility_registry;
		const count = props.count;
		const edge_state = registry.edge_map.get(path_str());
		const anchor_prefix = `--${path_str()}`;
		const g_prefix = `--g-${path_str()}`;
		const container_var = `;--_c:${anchor_prefix}`;
		const has_pair = count >= 2;
		const pair_vars = has_pair
			? `;--_f:${anchor_prefix}${PATH_SEPARATOR}0;--_s:${anchor_prefix}${PATH_SEPARATOR}1`
			: '';

		const result: GapMarker[] = [];

		if (count === 0) {
			if (visible().has(0)) {
				result.push({
					key: `${path_str()}-gap-0`,
					offset: 0,
					type: 'gap-empty',
					vars: `--_ct:${g_prefix}${PATH_SEPARATOR}0-gap-before;--_a:${anchor_prefix}${PATH_SEPARATOR}0${container_var}`,
					is_first: true,
					is_last: true,
					has_pair: false
				});
			}
			return result;
		}

		// Iterate visible indices (O(K)) instead of 0..count (O(N)) — at
		// 1000 nodes with ~30 visible, this drops 1001 set/map reads per
		// re-derivation to ~30. Filter stale indices >= count that may
		// briefly remain after a node delete.
		const sorted: number[] = [];
		for (const i of visible()) {
			if (i >= 0 && i < count) sorted.push(i);
		}
		sorted.sort((a, b) => a - b);
		if (sorted.length === 0) return result;

		const offsets: number[] = [];
		function add_offset(offset: number) {
			if (!offsets.includes(offset)) offsets.push(offset);
		}

		// Emissions accumulate in ascending offset order, so iterating
		// `offsets` later doesn't need a sort.
		// Edge gap-before: emit if node 0 is in the near set AND the
		// edge_map says the first node has reached the array's leading
		// edge. edge_map is the scroll-aware BCR check that replaces
		// the stale IO clip_map for edge nodes.
		if (sorted[0] === 0 && edge_state?.first === true) {
			add_offset(0);
		}
		// Mid gaps: between consecutive visible nodes. The gap at offset N
		// sits between node N-1 and node N — emit when both are visible.
		for (let i = 0; i < sorted.length - 1; i++) {
			if (sorted[i + 1] === sorted[i] + 1) add_offset(sorted[i + 1]);
		}
		// Edge gap-after.last: same gate as gap-before but on the trailing edge.
		if (sorted[sorted.length - 1] === count - 1 && edge_state?.last === true) {
			add_offset(count);
		}

		for (const offset of offsets) {
			const is_first = offset === 0;
			const is_last = offset === count;

			const g_anchor = is_first
				? `${g_prefix}${PATH_SEPARATOR}0-gap-before`
				: `${g_prefix}${PATH_SEPARATOR}${offset - 1}-gap-after`;

			let type: string, vars: string;
			if (is_first || is_last) {
				type = 'gap-edge';
				const adjacent = is_first
					? `${anchor_prefix}${PATH_SEPARATOR}0`
					: `${anchor_prefix}${PATH_SEPARATOR}${count - 1}`;
				vars = `--_ct:${g_anchor};--_a:${adjacent}${container_var}${pair_vars}`;
			} else {
				type = 'gap-mid';
				const p_anchor = `${anchor_prefix}${PATH_SEPARATOR}${offset - 1}`;
				const n_anchor = `${anchor_prefix}${PATH_SEPARATOR}${offset}`;
				vars = `--_ct:${g_anchor};--_p:${p_anchor};--_n:${n_anchor}${container_var}${pair_vars}`;
			}

			result.push({
				key: `${path_str()}-gap-${offset}`,
				offset,
				type,
				vars,
				is_first,
				is_last,
				has_pair
			});
		}
		return result;
	});

	// Markers are keyed by their gap key: an unchanged marker keeps its
	// element, and its data is looked up by key from the latest computation.
	const gaps_by_key = createMemo(() => new Map(my_gaps().map((gap) => [gap.key, gap])));
	const keys = createMemo(() => my_gaps().map((gap) => gap.key), [], {
		equals: (a, b) => a.length === b.length && a.every((key, index) => key === b[index])
	});

	return (
		<For each={keys()}>
			{(key) => {
				const gap = () => gaps_by_key().get(key);
				const is_active = () => key === caret_gap_key();
				return (
					<div
						class={class_names(
							'gap-marker',
							gap()?.type,
							is_active() && 'active',
							gap()?.is_first && 'first',
							gap()?.is_last && 'last',
							gap()?.has_pair && 'pair'
						)}
						style={`${gap()?.vars ?? ''};anchor-name:--gm-${key}`}
						data-gap-array-path={path_str()}
						data-gap-offset={gap()?.offset}
						contenteditable="false"
					>
						<Show when={is_active()}>
							<NodeCaret />
							<Show when={NodeGapTools()}>
								{(Tools) => (
									<Dynamic
										component={Tools()}
										path={props.path}
										offset={gap()?.offset ?? 0}
										is_first={Boolean(gap()?.is_first)}
										is_last={Boolean(gap()?.is_last)}
									/>
								)}
							</Show>
						</Show>
					</div>
				);
			}}
		</For>
	);
}
