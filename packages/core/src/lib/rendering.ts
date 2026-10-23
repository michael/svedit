// Pure helpers behind the editor components of every binding: how a text
// property splits into fragments, how a node array splits into runs and
// mark wrappers, the classes and anchors of nodes, gaps and gap markers,
// and the selection frames. They read the session but touch no DOM and no
// framework, so each binding's components only decide how to render.
import {
	PATH_SEPARATOR,
	calculate_fragment_ranges,
	char_slice,
	get_char_length,
	serialize_path
} from './utils.js';
import type Session from './Session.js';
import type {
	Attachment,
	DocumentPath,
	Fragment,
	Mark,
	NodeArrayAttachmentContext,
	NodeArrayFragment,
	NodeArrayRenderContext,
	NodeId,
	Selection,
	SelectionRange
} from './types.js';

/**
 * Converts text with marks into renderable fragments for display.
 * Annotations never fragment the text; they are data-only.
 */
export function get_text_fragments(
	session: Session,
	text: string,
	marks: Array<Mark>,
	selection_highlight_range?: SelectionRange | null
): Array<Fragment> {
	// Fast path: no marks and no selection highlight means the whole text
	// is a single content fragment. This runs for EVERY text property on
	// EVERY document change, so skipping the two full Intl.Segmenter passes
	// (get_char_length + char_slice over the whole text) matters at scale.
	if (marks.length === 0 && !selection_highlight_range) {
		return text.length > 0 ? [text] : [];
	}

	const ranges = calculate_fragment_ranges(get_char_length(text), marks, selection_highlight_range);
	const fragments: Array<Fragment> = [];

	for (const range of ranges) {
		const content = char_slice(text, range.start_offset, range.end_offset);

		if (range.type === 'mark') {
			const node = session.get(range.node_id);
			if (!node) throw new Error(`Node not found for mark ${range.node_id}`);

			fragments.push({
				type: 'mark',
				node,
				content,
				mark_index: range.mark_index!
			});
		} else if (range.type === 'selection_highlight') {
			fragments.push({
				type: 'selection_highlight',
				content
			});
		} else {
			fragments.push(content);
		}
	}

	return fragments;
}

/**
 * Whether two text fragments render the same, so a binding can keep the
 * previous fragment object (and its DOM) when nothing changed.
 */
export function text_fragments_equal(a: Fragment, b: Fragment): boolean {
	if (a === b) return true;
	if (typeof a === 'string' || typeof b === 'string') return false;
	if (a.type !== b.type || a.content !== b.content) return false;
	if (a.type === 'mark' && b.type === 'mark') {
		return a.node === b.node && a.mark_index === b.mark_index;
	}
	return true;
}

/**
 * Splits a node array into runs of plain nodes and runs wrapped by a mark.
 */
export function get_node_array_fragments(
	session: Session,
	node_ids: NodeId[],
	marks: Mark[]
): NodeArrayFragment[] {
	const ranges = calculate_fragment_ranges(node_ids.length, marks);
	const fragments: NodeArrayFragment[] = [];

	for (const range of ranges) {
		const nodes_slice = node_ids.slice(range.start_offset, range.end_offset);

		if (range.type === 'mark') {
			const node = session.get(range.node_id);
			fragments.push({
				type: 'mark',
				node,
				nodes: nodes_slice,
				start_index: range.start_offset,
				mark_index: range.mark_index!
			});
		} else if (range.type === 'content') {
			fragments.push({
				type: 'nodes',
				nodes: nodes_slice,
				start_index: range.start_offset
			});
		}
	}
	return fragments;
}

/**
 * Stable render keys for the nodes of a node array: `<node_id>:<occurrence>`,
 * so a node that appears twice in the same array still gets a unique key
 * that follows it across reorders.
 */
export function get_node_keys(node_ids: NodeId[]): string[] {
	const occurrences: Map<NodeId, number> = new Map();
	return node_ids.map((id) => {
		const occurrence = occurrences.get(id) ?? 0;
		occurrences.set(id, occurrence + 1);
		return `${id}:${occurrence}`;
	});
}

function get_range_context(
	session: Session,
	range: Attachment,
	index: number,
	node_index: number
): NodeArrayAttachmentContext {
	const node = session.get(range.node_id);
	const is_start = node_index === range.start_offset;
	const is_end = node_index === range.end_offset - 1;

	return {
		...range,
		index,
		node,
		is_start,
		is_middle: !is_start && !is_end,
		is_end
	};
}

/**
 * The marks or annotations of a node array that cover the node at
 * `node_index`, with the context node components receive as `mark` and
 * `annotations` props.
 */
export function get_covering_ranges(
	session: Session,
	ranges: Attachment[],
	node_index: number
): NodeArrayAttachmentContext[] {
	return ranges
		.map((range, index) => ({ range, index }))
		.filter(({ range }) => range.start_offset <= node_index && node_index < range.end_offset)
		.map(({ range, index }) => get_range_context(session, range, index, node_index));
}

/**
 * The node-array render context a node array provides to its child
 * `<Node>` wrappers. `get_value` returns the current node array value;
 * it is called on every read, so a reactive binding tracks it.
 */
export function create_node_array_render_context(
	session: () => Session,
	get_value: () => { nodes: NodeId[]; marks: Mark[]; annotations: Attachment[] }
): NodeArrayRenderContext {
	return {
		get length() {
			return get_value().nodes.length;
		},
		mark_for(node_index: number) {
			// The single mark wrapping this node, or null. Mark exclusivity
			// guarantees at most one. Annotations never wrap and are exposed
			// via `annotations` instead.
			return get_covering_ranges(session(), get_value().marks, node_index)[0] ?? null;
		},
		annotations_for(node_index: number) {
			return get_covering_ranges(session(), get_value().annotations, node_index);
		}
	};
}

/** Whether two attachment contexts carry the same information. */
export function attachment_context_equal(
	a: NodeArrayAttachmentContext | null | undefined,
	b: NodeArrayAttachmentContext | null | undefined
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.start_offset === b.start_offset &&
		a.end_offset === b.end_offset &&
		a.node_id === b.node_id &&
		a.index === b.index &&
		a.node === b.node &&
		a.is_start === b.is_start &&
		a.is_middle === b.is_middle &&
		a.is_end === b.is_end
	);
}

/** Element-wise `attachment_context_equal` for annotation lists. */
export function attachment_contexts_equal(
	a: NodeArrayAttachmentContext[],
	b: NodeArrayAttachmentContext[]
): boolean {
	if (a.length !== b.length) return false;
	return a.every((context, index) => attachment_context_equal(context, b[index]));
}

/**
 * Marks and annotations covering a node become classes automatically:
 * `mark-<type>`/`anno-<type>`, plus `-start`/`-end` variants on the run's
 * first/last covered node. This allows styling ranges (including
 * annotations, which never render wrapper components) with pure CSS. For
 * richer rendering, node components still receive the `mark` and
 * `annotations` props.
 */
export function get_range_classes(
	node_array_meta: NodeArrayRenderContext | undefined,
	child_index: number
): string {
	if (child_index < 0 || !node_array_meta?.annotations_for) return '';
	const classes: string[] = [];

	const add_classes = (range: NodeArrayAttachmentContext | null | undefined, prefix: string) => {
		const range_type = range?.node?.type;
		if (!range_type) return;
		classes.push(`${prefix}-${range_type}`);
		if (range.is_start) classes.push(`${prefix}-${range_type}-start`);
		if (range.is_end) classes.push(`${prefix}-${range_type}-end`);
	};

	add_classes(node_array_meta.mark_for?.(child_index), 'mark');
	for (const annotation of node_array_meta.annotations_for(child_index)) {
		add_classes(annotation, 'anno');
	}
	return classes.join(' ');
}

/**
 * The paths of the nodes covered by a non-collapsed node selection, or
 * undefined for any other selection.
 */
export function get_selected_node_paths(selection: Selection | null): DocumentPath[] | undefined {
	if (!selection) return;
	if (selection.type !== 'node' || selection.anchor_offset === selection.focus_offset) return;

	const paths: DocumentPath[] = [];
	const start = Math.min(selection.anchor_offset, selection.focus_offset);
	const end = Math.max(selection.anchor_offset, selection.focus_offset);
	for (let index = start; index < end; index++) {
		paths.push([...selection.path, index]);
	}
	return paths;
}

/**
 * The key of the gap marker carrying the node caret (a collapsed node
 * selection), or null. Matches `GapMarker.key`.
 */
export function get_caret_gap_key(selection: Selection | null): string | null {
	if (selection?.type !== 'node' || selection.anchor_offset !== selection.focus_offset) {
		return null;
	}
	return `${serialize_path(selection.path)}-gap-${selection.anchor_offset}`;
}

/**
 * The CSS custom properties and anchor name of the node gap at `offset`
 * in a node array. The gap anchors itself between the previous and the
 * next node (`--_pa`, `--_next`) inside the array container
 * (`--_container`), and names itself so the gap marker can find it.
 */
export function get_node_gap_anchors(
	array_path: DocumentPath,
	offset: number
): { pa: string; next: string; container: string; anchor_name: string } {
	const is_first = offset === 0;
	return {
		pa: is_first
			? `--${serialize_path([...array_path, 0])}`
			: `--${serialize_path([...array_path, offset - 1])}`,
		next: `--${serialize_path([...array_path, offset])}`,
		container: `--${serialize_path(array_path)}`,
		anchor_name: is_first
			? `--g-${serialize_path([...array_path, 0])}-gap-before`
			: `--g-${serialize_path([...array_path, offset - 1])}-gap-after`
	};
}

/** One insertion marker rendered by NodeGapMarkers. */
export type GapMarker = {
	key: string;
	offset: number;
	/** `gap-empty`, `gap-edge` or `gap-mid` */
	type: string;
	/** CSS custom properties as a `--name:value;...` string */
	vars: string;
	is_first: boolean;
	is_last: boolean;
	has_pair: boolean;
};

/**
 * The gap markers of a node array: one between every two near nodes, plus
 * the edge markers when the first/last node is near and has reached the
 * matching container edge. Iterates the near indices (O(K)) instead of
 * 0..count (O(N)) — at 1000 nodes with ~30 near, this drops 1001 set reads
 * per re-derivation to ~30.
 *
 * @param near - near child indices of the array (from the visibility registry)
 * @param edge_state - the array's edge state (from the visibility registry)
 */
export function get_gap_markers(
	near: Iterable<number> & { has(index: number): boolean },
	edge_state: { first: boolean; last: boolean } | undefined,
	path_str: string,
	count: number
): GapMarker[] {
	const anchor_prefix = `--${path_str}`;
	const g_prefix = `--g-${path_str}`;
	const container_var = `;--_c:${anchor_prefix}`;
	const has_pair = count >= 2;
	const pair_vars = has_pair
		? `;--_f:${anchor_prefix}${PATH_SEPARATOR}0;--_s:${anchor_prefix}${PATH_SEPARATOR}1`
		: '';

	const result: GapMarker[] = [];

	if (count === 0) {
		if (near.has(0)) {
			result.push({
				key: `${path_str}-gap-0`,
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

	// Filter stale indices >= count that may briefly remain after a node
	// delete.
	const sorted: number[] = [];
	for (const i of near) {
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
	// edge. edge_map is the scroll-aware check that replaces
	// the stale IO clip_map for edge nodes.
	if (sorted[0] === 0 && edge_state?.first === true) {
		add_offset(0);
	}
	// Mid gaps: between consecutive near nodes. The gap at offset N
	// sits between node N-1 and node N — emit when both are near.
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
			key: `${path_str}-gap-${offset}`,
			offset,
			type,
			vars,
			is_first,
			is_last,
			has_pair
		});
	}
	return result;
}
