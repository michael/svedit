import { split_annotated_text, join_annotated_text, get_char_length } from './utils.js';
import { get_default_node_type } from './doc_utils.js';

/**
 * Set multiple properties on a node via a transaction.
 *
 * @param {object} tr - The transaction
 * @param {Array} path - Path to the node
 * @param {Record<string, any>} properties - Key/value pairs to set
 */
export function set_properties(tr, path, properties) {
	for (const [key, value] of Object.entries(properties)) {
		tr.set([...path, key], value);
	}
}

export function break_text_node(tr) {
	// Keep a reference of the original selection (before any transforms are applied)
	const selection = tr.selection;
	// First we need to ensure we have a text selection
	if (selection.type !== 'text') return false;

	// Next, we need to determine if the enclosing node is a pure text node (e.g. paragraph),
	// which is wrapped inside a node_array (e.g. page.body)

	// Owner of the text property (e.g. paragraph)
	const node = tr.get(selection.path.slice(0, -1));
	if (tr.kind(node) !== 'text') return false;
	const is_inside_node_array = tr.inspect(selection.path.slice(0, -2))?.type === 'node_array';
	if (!is_inside_node_array) return false; // Do nothing if we're not inside a node_array
	const node_array_prop = selection.path.at(-3);
	// Get the node that owns the node_array property (e.g. a page.body)
	const node_array_node = tr.get(selection.path.slice(0, -3));


	// Delete selection unless collapsed
	if (selection.anchor_offset !== selection.focus_offset) {
		tr.delete_selection();
	}

	const split_at_position = tr.selection.anchor_offset;
	const content = tr.get(selection.path);
	const [left_text, right_text] = split_annotated_text(content, split_at_position);

	tr.set([node.id, 'content'], left_text);

	const node_insert_position = {
		type: 'node',
		path: tr.selection.path.slice(0, -2),
		anchor_offset: parseInt(tr.selection.path.at(-2), 10) + 1,
		focus_offset: parseInt(tr.selection.path.at(-2), 10) + 1
	};

	// TODO: Only use default_node_type when caret is at the end of
	const node_array_property_definition =
		tr.schema[node_array_node.type].properties[node_array_prop];
	const target_node_type = get_default_node_type(node_array_property_definition);

	if (!target_node_type) {
		console.warn(
			'Cannot determine target node type for break_text_node - no default_ref_type and multiple node_types'
		);
		return false;
	}

	tr.set_selection(node_insert_position);

	tr.config.inserters[target_node_type](tr, right_text);
	return true;
}

export function join_text_node(tr) {
	// Keep a reference of the original selection (before any transforms are applied)
	const selection = tr.selection;
	// First we need to ensure we have a text selection
	if (selection.type !== 'text') return false;

	const node = tr.get(selection.path.slice(0, -1));
	if (tr.kind(node) !== 'text') return false;
	const is_inside_node_array = tr.inspect(selection.path.slice(0, -2))?.type === 'node_array';
	if (!is_inside_node_array) return false; // Do nothing if we're not inside a node_array

	const node_index = parseInt(tr.selection.path.at(-2), 10);

	// Determine if we can join with the previous node
	let can_join = false;
	let predecessor_node = null;

	if (node_index > 0) {
		const previous_text_path = [...tr.selection.path.slice(0, -2), node_index - 1];
		predecessor_node = tr.get(previous_text_path);
		can_join = tr.kind(predecessor_node) === 'text';
	}

	// Special behavior: if we can't join and current node is empty, delete it
	if (!can_join && node.content.text === '') {
		tr.set_selection({
			type: 'node',
			path: tr.selection.path.slice(0, -2),
			anchor_offset: node_index,
			focus_offset: node_index + 1
		});
		tr.delete_selection();
		return true;
	}

	// If we can't join for any reason, return false
	if (!can_join) {
		return false;
	}

	// Normal joining logic - both nodes are text nodes
	const previous_text_path = [...tr.selection.path.slice(0, -2), node_index - 1];
	const joined_text = join_annotated_text(predecessor_node.content, node.content);

	// Calculate caret position based on original predecessor content length
	const caret_position = get_char_length(predecessor_node.content.text);

	// First set the joined content on the predecessor node (preserves annotations)
	tr.set([predecessor_node.id, 'content'], joined_text);

	// Then delete the current node
	tr.set_selection({
		type: 'node',
		path: tr.selection.path.slice(0, -2),
		anchor_offset: node_index,
		focus_offset: node_index + 1
	});

	tr.delete_selection();

	// Finally set the caret position at the join point using the pre-calculated position
	tr.set_selection({
		type: 'text',
		path: [...previous_text_path, 'content'],
		anchor_offset: caret_position,
		focus_offset: caret_position
	});
	return true;
}

export function insert_default_node(tr) {
	const selection = tr.selection;

	// Only work with collapsed node selections
	if (selection?.type !== 'node' || selection.anchor_offset !== selection.focus_offset) {
		return false;
	}

	const path = selection.path;
	const node_array_node = tr.get(path.slice(0, -1));
	const property_name = path.at(-1);

	// Get the definition for this property
	const property_definition = tr.schema[node_array_node.type].properties[property_name];
	const default_type = get_default_node_type(property_definition);

	// Use the inserter function if available
	if (tr.config?.inserters?.[default_type]) {
		tr.config.inserters[default_type](tr);
		return true;
	} else {
		throw new Error(`No inserter function available for default node type '${default_type}'`);
	}
}

export function insert_default_node_before(tr) {
	const selection = tr.selection;

	let node_array_path;
	let insert_offset;

	if (selection?.type === 'text') {
		// "Current node" is the node containing the text. Insert at its index.
		const node_path = selection.path.slice(0, -1);
		node_array_path = node_path.slice(0, -1);
		if (tr.inspect(node_array_path)?.type !== 'node_array') return false;
		insert_offset = parseInt(node_path.at(-1), 10);
	} else if (selection?.type === 'node' && selection.anchor_offset === selection.focus_offset) {
		// In a node gap, "current node" is the node above the caret (offset - 1).
		// Inserting before it means inserting at offset - 1.
		if (selection.anchor_offset === 0) return false;
		node_array_path = selection.path;
		insert_offset = selection.anchor_offset - 1;
	} else {
		return false;
	}

	const node_array_node = tr.get(node_array_path.slice(0, -1));
	const property_name = node_array_path.at(-1);
	const property_definition = tr.schema[node_array_node.type].properties[property_name];
	const default_type = get_default_node_type(property_definition);

	if (!tr.config?.inserters?.[default_type]) {
		throw new Error(`No inserter function available for default node type '${default_type}'`);
	}

	tr.set_selection({
		type: 'node',
		path: node_array_path,
		anchor_offset: insert_offset,
		focus_offset: insert_offset
	});

	tr.config.inserters[default_type](tr);
	return true;
}
