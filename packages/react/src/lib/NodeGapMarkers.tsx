import { useMemo } from 'react';
import NodeCaret from './NodeCaret.js';
import { useSveditContext } from './context.js';
import { useSvedit } from './hooks.js';
import { shallow_equal, useVersion } from './reactive.js';
import { class_names } from './react_utils.js';
import { PATH_SEPARATOR, serialize_path } from '@svedit/core';
import type { CSSProperties, ReactNode } from 'react';
import type { DocumentPath, SveditRenderContext } from './types.js';
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
 * Reads visibility state directly from the registry and subscribes to
 * this array's store only, so the component re-evaluates when THIS
 * array's visible-index set or edge state changes.
 *
 * The active marker (the one carrying the caret) additionally renders the
 * consumer's `system_components.node_gap_tools` component when configured
 * — an extension point for gap-scoped tools (e.g. an insert button).
 * Rendering inside the marker means the tool inherits --row for
 * orientation-aware styling and shows/hides together with the caret.
 * The marker has pointer-events: none — interactive tools must set
 * pointer-events: auto themselves.
 */
type GapMarker = {
	key: string;
	offset: number;
	type: string;
	vars: CSSProperties;
	is_first: boolean;
	is_last: boolean;
	has_pair: boolean;
};

export type NodeGapMarkersProps = { path: DocumentPath; count: number };

function parse_vars(vars: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const declaration of vars.split(';')) {
		if (!declaration) continue;
		const index = declaration.indexOf(':');
		result[declaration.slice(0, index)] = declaration.slice(index + 1);
	}
	return result;
}

export default function NodeGapMarkers({ path, count }: NodeGapMarkersProps) {
	const svedit = useSveditContext() as SveditRenderContext;
	const registry = svedit.visibility_registry;
	const path_str = serialize_path(path);
	const visible = registry.get_array_indices(path_str);
	const array_version = useVersion(registry.get_array_store(path_str));

	const { NodeGapTools, caret_gap_key } = useSvedit((context) => {
		const s = context.session.selection;
		const caret_gap_key =
			s?.type === 'node' && s.anchor_offset === s.focus_offset
				? `${serialize_path(s.path)}-gap-${s.anchor_offset}`
				: null;
		return {
			NodeGapTools: context.session.config.system_components?.node_gap_tools,
			caret_gap_key
		};
	}, shallow_equal);

	const my_gaps = useMemo<GapMarker[]>(() => {
		void array_version;
		const edge_state = registry.edge_map.get(path_str);
		const anchor_prefix = `--${path_str}`;
		const g_prefix = `--g-${path_str}`;
		const container_var = `;--_c:${anchor_prefix}`;
		const has_pair = count >= 2;
		const pair_vars = has_pair
			? `;--_f:${anchor_prefix}${PATH_SEPARATOR}0;--_s:${anchor_prefix}${PATH_SEPARATOR}1`
			: '';

		const result: GapMarker[] = [];

		if (count === 0) {
			if (visible.has(0)) {
				const key = `${path_str}-gap-0`;
				result.push({
					key,
					offset: 0,
					type: 'gap-empty',
					vars: {
						...parse_vars(
							`--_ct:${g_prefix}${PATH_SEPARATOR}0-gap-before;--_a:${anchor_prefix}${PATH_SEPARATOR}0${container_var}`
						),
						anchorName: `--gm-${key}`
					} as CSSProperties,
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
		for (const i of visible) {
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

			const key = `${path_str}-gap-${offset}`;
			result.push({
				key,
				offset,
				type,
				vars: { ...parse_vars(vars), anchorName: `--gm-${key}` } as CSSProperties,
				is_first,
				is_last,
				has_pair
			});
		}
		return result;
	}, [registry, visible, path_str, count, array_version]);

	return (
		<>
			{my_gaps.map((gap) => {
				const is_active = gap.key === caret_gap_key;
				const children: ReactNode[] = [];
				if (is_active) {
					children.push(<NodeCaret key="caret" />);
					if (NodeGapTools) {
						children.push(
							<NodeGapTools
								key="tools"
								path={path}
								offset={gap.offset}
								is_first={gap.is_first}
								is_last={gap.is_last}
							/>
						);
					}
				}
				return (
					<div
						key={gap.key}
						className={class_names(
							'gap-marker',
							gap.type,
							is_active && 'active',
							gap.is_first && 'first',
							gap.is_last && 'last',
							gap.has_pair && 'pair'
						)}
						style={gap.vars}
						data-gap-array-path={path_str}
						data-gap-offset={gap.offset}
						contentEditable={false}
					>
						{children}
					</div>
				);
			})}
		</>
	);
}
