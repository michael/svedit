import { split_text, join_text, get_char_length } from './utils.js';
import { get_default_node_type, fill_node_defaults } from './doc_utils.js';

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

/**
 * Insert a new node of the given type at the current node selection.
 *
 * A custom inserter registered in `config.inserters[node_type]` always wins.
 * Otherwise a generic schema-driven insertion is performed: the node is
 * created from schema defaults, inserted, and — for `kind: 'text'` nodes — a
 * collapsed text selection is placed at the start of its content.
 *
 * @param {object} tr - The transaction
 * @param {string} node_type - The node type to insert
 * @param {any} [content] - Optional text value assigned to `content` (kind 'text' only)
 */
export function insert_node_of_type(tr, node_type, content) {
	const custom_inserter = tr.config?.inserters?.[node_type];
	if (custom_inserter) {
		custom_inserter(tr, content);
		return;
	}

	const node = fill_node_defaults({ id: tr.generate_id(), type: node_type }, tr.schema);
	const node_kind = tr.schema[node_type]?.kind;
	if (content !== undefined && node_kind === 'text') {
		node.content = content;
	}

	try {
		tr.create(node);
	} catch (error) {
		throw new Error(
			`Cannot auto-insert node type '${node_type}' from schema defaults (${/** @type {Error} */ (error).message}). Define config.inserters['${node_type}'].`,
			{ cause: error }
		);
	}
	tr.insert_nodes([node.id]);

	if (node_kind === 'text') {
		tr.set_selection({
			type: 'text',
			path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
			anchor_offset: 0,
			focus_offset: 0
		});
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
	const [left_text, right_text] = split_text(content, split_at_position);

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

	insert_node_of_type(tr, target_node_type, right_text);
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
	if (!can_join && node.content.content === '') {
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
	const joined_text = join_text(predecessor_node.content, node.content);

	// Calculate caret position based on original predecessor content length
	const caret_position = get_char_length(predecessor_node.content.content);

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

	if (!default_type) {
		console.warn('Cannot determine default node type for insert_default_node');
		return false;
	}

	insert_node_of_type(tr, default_type);
	return true;
}
