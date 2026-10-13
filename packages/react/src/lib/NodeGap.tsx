import { useSveditContext } from './context.js';
import { useSnapshot, shallow_equal } from './reactive.js';
import { serialize_path } from '@svedit/core';
import { should_position_gap } from './node_visibility.js';
import { class_names } from './react_utils.js';
import type { CSSProperties, PointerEvent } from 'react';
import type { DocumentPath, SveditRenderContext } from './types.js';
import './NodeGap.css';

/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ MUST RULES — do not violate when modifying this file            │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ 1. Edge gaps (gap-before at offset 0 / gap-after.last) MUST      │
 * │    render OUTSIDE the node-array container — they extend into   │
 * │    the whitespace above/below (column) or left/right (row) of   │
 * │    the first/last node. They only clamp when the consumer       │
 * │    explicitly opts in via --node-caret-boundary(-x/-y).         │
 * │ 2. Gaps MUST NEVER overlap nodes. They render strictly in the   │
 * │    whitespace between nodes (mid gaps) or outside the node      │
 * │    array bounds (edge gaps). Never on top of a node.            │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Invisible keyboard caret selectable and gap hit area.
 *
 * Rendered as a sibling of Node elements inside NodeArrayProperty,
 * interleaved between nodes in DOM order. This ensures:
 * - Correct DOM order for native drag-to-select across nodes
 * - No containing-block issues from transform/filter/will-change on nodes
 *
 * Always present in the DOM when editable (stable structure for
 * selection anchoring, scrollTo, etc.). Anchor positioning is
 * activated lazily via the `.positioned` class, derived from the
 * visibility registry's array_indices / edge_map through a snapshot
 * subscribed to this array's store, so a registry write only
 * re-evaluates the gaps of the affected array. Applying the class
 * declaratively (instead of imperative classList toggles) means it
 * survives DOM recreation without a document change (e.g. dev-mode HMR).
 *
 * `position-visibility: anchors-visible` does NOT skip anchor
 * resolution — the browser resolves all anchor() then hides the
 * result. The `.positioned` class toggle is required to prevent
 * O(N) anchor resolution on every layout pass.
 *
 * Row/column detection uses var(--row, 1) with the * 99999 multiplier
 * trick — no @container style() queries, works in all browsers.
 *
 * If you override this component via `system_components.node_gap`, make
 * sure your custom component also handles read-only mode by rendering a
 * plain `.node-gap` placeholder without editable internals.
 */
export type NodeGapProps = {
	array_path: DocumentPath;
	offset: number;
	count: number;
	empty?: boolean;
};

function cycle_z_index(event: PointerEvent<HTMLDivElement>) {
	const el = event.currentTarget;
	if (el.hasAttribute('data-sent-to-back')) {
		document.querySelectorAll('.svedit-selectable[data-sent-to-back]').forEach((prev) => {
			prev.removeAttribute('data-sent-to-back');
		});
	}
	el.setAttribute('data-sent-to-back', '');
}

export default function NodeGap({ array_path, offset, count, empty = false }: NodeGapProps) {
	const svedit = useSveditContext() as SveditRenderContext;
	const registry = svedit.visibility_registry;
	const is_first = offset === 0;
	const is_last = offset === count;
	const type = is_first ? 'gap-before' : 'gap-after';
	const path_str = serialize_path(array_path);
	// get_array_indices / get_array_store lazily create the (stable) state
	// for this array; the snapshot below re-evaluates only on its writes.
	const near_indices = registry.get_array_indices(path_str);
	const array_store = registry.get_array_store(path_str);

	const { is_editable, positioned } = useSnapshot(
		[svedit, array_store],
		() => {
			const is_editable = svedit.editable;
			return {
				is_editable,
				positioned:
					is_editable &&
					should_position_gap(near_indices, registry.edge_map.get(path_str), offset, is_last, empty)
			};
		},
		shallow_equal
	);

	if (!is_editable) return <div className="node-gap"></div>;

	const prev_idx = offset - 1;
	const pa = is_first
		? `--${serialize_path([...array_path, 0])}`
		: `--${serialize_path([...array_path, prev_idx])}`;
	const next = `--${serialize_path([...array_path, offset])}`;
	const container = `--${serialize_path(array_path)}`;
	const gap_style = { '--_pa': pa, '--_next': next, '--_container': container } as CSSProperties;

	const anchor_name = is_first
		? `--g-${serialize_path([...array_path, 0])}-gap-before`
		: `--g-${serialize_path([...array_path, offset - 1])}-gap-after`;

	return (
		<div
			className={class_names(
				'node-gap',
				is_first ? 'gap-before' : 'gap-after',
				empty && 'empty',
				is_last && 'last',
				positioned && 'positioned'
			)}
			data-type={type}
			data-gap-array-path={path_str}
			data-gap-offset={offset}
			style={gap_style}
		>
			<div
				className="svedit-selectable"
				style={{ anchorName: anchor_name } as CSSProperties}
				onPointerDown={cycle_z_index}
			>
				<br />
			</div>
		</div>
	);
}
