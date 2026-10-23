import { useMemo } from 'react';
import NodeCaret from './NodeCaret.js';
import { useSveditContext } from './context.js';
import { useSvedit } from './hooks.js';
import { shallow_equal, useVersion } from './reactive.js';
import { class_names } from './react_utils.js';
import { get_caret_gap_key, get_gap_markers, serialize_path } from '@svedit/core';
import type { GapMarker } from '@svedit/core';
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
type RenderedGapMarker = Omit<GapMarker, 'vars'> & { vars: CSSProperties };

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

	const { NodeGapTools, caret_gap_key } = useSvedit(
		(context) => ({
			NodeGapTools: context.session.config.system_components?.node_gap_tools,
			caret_gap_key: get_caret_gap_key(context.session.selection)
		}),
		shallow_equal
	);

	const my_gaps = useMemo<RenderedGapMarker[]>(() => {
		void array_version;
		return get_gap_markers(visible, registry.edge_map.get(path_str), path_str, count).map(
			(gap) => ({
				...gap,
				vars: { ...parse_vars(gap.vars), anchorName: `--gm-${gap.key}` } as CSSProperties
			})
		);
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
