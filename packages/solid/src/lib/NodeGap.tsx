import { Show, createMemo } from 'solid-js';
import { get_node_gap_anchors, serialize_path, should_position_gap } from '@svedit/core';
import { use_svedit } from './context.js';
import { class_names } from './solid_utils.js';
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
 * activated lazily via the `.positioned` class, derived reactively
 * from the visibility registry's array_indices / edge_map. The
 * registry's reactive collections track reads at per-key granularity, so a
 * registry write only re-evaluates the adjacent gaps. Applying the
 * class declaratively (instead of imperative classList toggles) means
 * it survives DOM recreation without a document change (e.g. dev-mode HMR).
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

function cycle_z_index(event: PointerEvent & { currentTarget: HTMLDivElement }) {
	const el = event.currentTarget;
	if (el.hasAttribute('data-sent-to-back')) {
		document.querySelectorAll('.svedit-selectable[data-sent-to-back]').forEach((prev) => {
			prev.removeAttribute('data-sent-to-back');
		});
	}
	el.setAttribute('data-sent-to-back', '');
}

export default function NodeGap(props: NodeGapProps) {
	const svedit = use_svedit() as SveditRenderContext;
	const is_editable = () => svedit.editable;

	const is_first = () => props.offset === 0;
	const is_last = () => props.offset === props.count;
	const type = () => (is_first() ? 'gap-before' : 'gap-after');

	const path_str = createMemo(() => serialize_path(props.array_path));
	// get_array_indices lazily creates the (stable) reactive set for this
	// array; membership reads below are tracked per key.
	const near_indices = createMemo(() => svedit.visibility_registry.get_array_indices(path_str()));
	const positioned = createMemo(
		() =>
			is_editable() &&
			should_position_gap(
				near_indices(),
				svedit.visibility_registry.edge_map.get(path_str()),
				props.offset,
				is_last(),
				Boolean(props.empty)
			)
	);

	const anchors = createMemo(() => get_node_gap_anchors(props.array_path, props.offset));
	const gap_style = () => {
		const { pa, next, container } = anchors();
		return `--_pa:${pa};--_next:${next};--_container:${container}`;
	};

	return (
		<Show when={is_editable()} fallback={<div class="node-gap" />}>
			<div
				class={class_names(
					'node-gap',
					is_first() ? 'gap-before' : 'gap-after',
					props.empty && 'empty',
					is_last() && 'last',
					positioned() && 'positioned'
				)}
				data-type={type()}
				data-gap-array-path={path_str()}
				data-gap-offset={props.offset}
				style={gap_style()}
			>
				<div
					class="svedit-selectable"
					style={`anchor-name:${anchors().anchor_name}`}
					onPointerDown={cycle_z_index}
				>
					<br />
				</div>
			</div>
		</Show>
	);
}
