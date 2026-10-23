import { For, Show, createMemo } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import NodeCaret from './NodeCaret.js';
import { get_caret_gap_key, get_gap_markers, serialize_path } from '@svedit/core';
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

	const caret_gap_key = createMemo(() => get_caret_gap_key(svedit.session.selection));

	const my_gaps = createMemo(() =>
		get_gap_markers(
			visible(),
			svedit.visibility_registry.edge_map.get(path_str()),
			path_str(),
			props.count
		)
	);

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
