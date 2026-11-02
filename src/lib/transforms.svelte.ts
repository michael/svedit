import { split_text, join_text, get_char_length, is_selection_collapsed } from './utils.js';
import { get_default_node_type } from './doc_utils.js';
import type Transaction from './Transaction.svelte.js';
import type { DocumentPath, NodeArrayProperty, NodeProperty } from './types.js';

/** Set multiple properties on a node via a transaction. */
export function set_properties(
	tr: Transaction,
	path: DocumentPath,
	properties: Record<string, unknown>
): void {
	for (const [key, value] of Object.entries(properties)) tr.set([...path, key], value);
}

/**
 * The text node owning a text selection, if it sits directly in a node_array
 * (e.g. a paragraph in page.body). Transforms on text nodes require this.
 */
function get_text_node_in_array(tr: Transaction) {
	const selection = tr.selection;
	if (selection.type !== 'text') return null;
	const node = tr.get(selection.path.slice(0, -1));
	if (tr.kind(node) !== 'text') return null;
	const array_path = selection.path.slice(0, -2);
	if (tr.inspect(array_path)?.type !== 'node_array') return null;
	return { node, array_path, index: selection.path.at(-2) as number };
}

/**
 * Split the text node at the caret into two nodes. The second node is
 * created through the inserter of the node array's default node type.
 */
export function break_text_node(tr: Transaction): boolean {
	const target = get_text_node_in_array(tr);
	if (!target) return false;
	const { node, array_path, index } = target;
	const text_path = tr.selection.path;
	if (!is_selection_collapsed(tr.selection)) tr.delete_selection();

	const [left_text, right_text] = split_text(
		tr.get(text_path),
		(tr.selection as { anchor_offset: number }).anchor_offset
	);
	// Each attachment occurrence belongs to exactly one range after the split
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local set.
	const used_attachment_ids = new Set(
		[...left_text.marks, ...left_text.annotations].map((range) => range.node_id)
	);
	for (const range of [...right_text.marks, ...right_text.annotations]) {
		if (used_attachment_ids.has(range.node_id))
			range.node_id = tr.build(range.node_id, tr.doc.nodes);
		else used_attachment_ids.add(range.node_id);
	}
	tr.set([node.id, 'content'], left_text);

	const array_owner = tr.get(array_path.slice(0, -1));
	const target_node_type = get_default_node_type(
		tr.schema[array_owner.type].properties[String(array_path.at(-1))] as
			NodeProperty | NodeArrayProperty
	);
	if (!target_node_type) {
		console.warn(
			'Cannot determine target node type for break_text_node - no default_ref_type and multiple node_types'
		);
		return false;
	}
	tr.set_selection({
		type: 'node',
		path: array_path,
		anchor_offset: index + 1,
		focus_offset: index + 1
	});
	tr.config.inserters[target_node_type](tr, right_text);
	return true;
}

/**
 * Join the text node at the caret into its preceding text node. An empty
 * text node without a text predecessor is deleted instead.
 */
export function join_text_node(tr: Transaction): boolean {
	const target = get_text_node_in_array(tr);
	if (!target) return false;
	const { node, array_path, index } = target;
	const predecessor = index > 0 ? tr.get([...array_path, index - 1]) : null;
	const can_join = !!predecessor && tr.kind(predecessor) === 'text';
	if (!can_join && node.content.content !== '') return false;

	if (can_join) tr.set([predecessor.id, 'content'], join_text(predecessor.content, node.content));
	tr.set_selection({
		type: 'node',
		path: array_path,
		anchor_offset: index,
		focus_offset: index + 1
	});
	tr.delete_selection();
	if (can_join) {
		const caret = get_char_length(predecessor.content.content);
		tr.set_selection({
			type: 'text',
			path: [...array_path, index - 1, 'content'],
			anchor_offset: caret,
			focus_offset: caret
		});
	}
	return true;
}

/** Insert the default node type of the node array at a collapsed node caret. */
export function insert_default_node(tr: Transaction): boolean {
	const selection = tr.selection;
	if (selection?.type !== 'node' || !is_selection_collapsed(selection)) return false;
	const owner = tr.get(selection.path.slice(0, -1));
	const default_type = get_default_node_type(
		tr.schema[owner.type].properties[String(selection.path.at(-1))] as
			NodeProperty | NodeArrayProperty
	);
	const inserter = tr.config?.inserters?.[default_type as string];
	if (!inserter)
		throw new Error(`No inserter function available for default node type '${default_type}'`);
	inserter(tr);
	return true;
}
