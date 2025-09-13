import { split_annotated_string, join_annotated_string, get_char_length } from './util.js';
import { get_default_node_type } from './Document.svelte.js';

export function break_text_node(tr) {
  const doc = tr.doc;
  // Keep a reference of the original selection (before any transforms are applied)
  const selection = doc.selection;
  // First we need to ensure we have a text selection
  if (selection.type !== 'text') return false;

  // Next, we need to determine if the enclosing node is a pure text node (e.g. paragraph),
  // which is wrapped inside a node_array (e.g. page.body)

  // Owner of the text property (e.g. paragraph)
  const node = doc.get(selection.path.slice(0, -1));
  if (doc.kind(node) !== 'text') return false;
  const is_inside_node_array = doc.inspect(selection.path.slice(0, -2))?.type === 'node_array';
  // console.log('is_inside_node_array', is_inside_node_array);
  if (!is_inside_node_array) return false; // Do nothing if we're not inside a node_array
  const node_array_prop = selection.path.at(-3);
  // console.log('node_array_prop', node_array_prop);
  // Get the node that owns the node_array property (e.g. a page.body)
  const node_array_node = doc.get(selection.path.slice(0, -3));
  // console.log('node_array_node', $state.snapshot(node_array_node));

  // Delete selection unless collapsed
  if (selection.anchor_offset !== selection.focus_offset) {
    tr.delete_selection();
  }

  const split_at_position = tr.doc.selection.anchor_offset;
  const content = tr.doc.get(selection.path);
  const [left_text, right_text] = split_annotated_string(content, split_at_position);

  tr.set([node.id, 'content'], left_text);

  const node_insert_position = {
    type: 'node',
    path: tr.doc.selection.path.slice(0, -2),
    anchor_offset: parseInt(tr.doc.selection.path.at(-2), 10) + 1,
    focus_offset: parseInt(tr.doc.selection.path.at(-2), 10) + 1,
  };

  // TODO: Only use default_node_type when cursor is at the end of
  const node_array_property_definition = doc.schema[node_array_node.type].properties[node_array_prop];
  const target_node_type = get_default_node_type(node_array_property_definition);

  if (!target_node_type) {
    console.warn('Cannot determine target node type for break_text_node - no default_ref_type and multiple node_types');
    return false;
  }

  tr.set_selection(node_insert_position);

  doc.config.inserters[target_node_type](tr, right_text);
  return true;
}

export function join_text_node(tr) {
  const doc = tr.doc;
  // Keep a reference of the original selection (before any transforms are applied)
  const selection = doc.selection;
  // First we need to ensure we have a text selection
  if (selection.type !== 'text') return false;

  const node = doc.get(selection.path.slice(0, -1));
  if (doc.kind(node) !== 'text') return false;
  const is_inside_node_array = doc.inspect(selection.path.slice(0, -2))?.type === 'node_array';
  // console.log('is_inside_node_array', is_inside_node_array);
  if (!is_inside_node_array) return false; // Do nothing if we're not inside a node_array

  const node_index = parseInt(doc.selection.path.at(-2), 10);

  // Determine if we can join with the previous node
  let can_join = false;
  let predecessor_node = null;

  if (node_index > 0) {
    const previous_text_path = [...doc.selection.path.slice(0, -2), node_index - 1];
    predecessor_node = doc.get(previous_text_path);
    can_join = doc.kind(predecessor_node) === 'text';
  }

  // Special behavior: if we can't join and current node is empty, delete it
  if (!can_join && node.content.text === '') {
    tr.set_selection({
      type: 'node',
      path: doc.selection.path.slice(0, -2),
      anchor_offset: node_index,
      focus_offset: node_index + 1,
    });
    tr.delete_selection();
    return true;
  }

  // If we can't join for any reason, return false
  if (!can_join) {
    return false;
  }

  // Normal joining logic - both nodes are text nodes
  const previous_text_path = [...doc.selection.path.slice(0, -2), node_index - 1];
  const joined_text = join_annotated_string(predecessor_node.content, node.content);

  // Calculate cursor position based on original predecessor content length
  const cursor_position = get_char_length(predecessor_node.content.text);

  // First set the joined content on the predecessor node (preserves annotations)
  tr.set([predecessor_node.id, 'content'], joined_text);

  // Then delete the current node
  tr.set_selection({
    type: 'node',
    path: doc.selection.path.slice(0, -2),
    anchor_offset: node_index,
    focus_offset: node_index + 1,
  });

  tr.delete_selection();
  
  // Finally set the cursor position at the join point using the pre-calculated position
  tr.set_selection({
    type: 'text',
    path: [...previous_text_path, 'content'],
    anchor_offset: cursor_position,
    focus_offset: cursor_position,
  });
  return true;
}

export function insert_default_node(tr) {
  const doc = tr.doc;
  const selection = doc.selection;

  // Only work with collapsed node selections
  if (selection?.type !== 'node' || selection.anchor_offset !== selection.focus_offset) {
    return false;
  }

  const path = selection.path;
  const node_array_node = doc.get(path.slice(0, -1));
  const property_name = path.at(-1);

  // Get the definition for this property
  const property_definition = doc.schema[node_array_node.type].properties[property_name];
  const default_type = get_default_node_type(property_definition);

  // Only proceed if there's exactly one allowed node_type
  // if (!default_type || property_schema.node_types.length !== 1) {
  //   return false;
  // }

  // Use the inserter function if available
  if (doc.config?.inserters?.[default_type]) {
    doc.config.inserters[default_type](tr);
    return true;
  } else {
    throw new Error(`No inserter function available for default node type '${default_type}'`);
  }
}

export function select_all(tr) {
  const doc = tr.doc;
  const selection = doc.selection;

  if (!selection) {
    return false;
  }

  if (selection.type === 'text') {
    const text_content = doc.get(selection.path);
    const text_length = get_char_length(text_content.text);

    // Check if all text is already selected
    const is_all_text_selected =
      Math.min(selection.anchor_offset, selection.focus_offset) === 0 &&
      Math.max(selection.anchor_offset, selection.focus_offset) === text_length;

    if (!is_all_text_selected) {
      // Select all text in the current text node
      tr.set_selection({
        type: 'text',
        path: selection.path,
        anchor_offset: 0,
        focus_offset: text_length
      });
      return true;
    } else {
      // All text is selected, move up to select the containing node
      const node_path = selection.path.slice(0, -1); // Remove the property name (e.g., 'content')

      // Check if we have enough path segments and if we're inside a node_array
      if (node_path.length >= 2) {
        const is_inside_node_array = doc.inspect(node_path.slice(0, -1))?.type === 'node_array';

        if (is_inside_node_array) {
          const node_index = parseInt(node_path.at(-1));
          tr.set_selection({
            type: 'node',
            path: node_path.slice(0, -1),
            anchor_offset: node_index,
            focus_offset: node_index + 1
          });
          return true;
        }
      }
      // Stop expanding - text is not in a selectable node_array
    }
  } else if (selection.type === 'node') {
    const node_array_path = selection.path;
    const node_array = doc.get(node_array_path);

    // Check if the entire node_array is already selected
    const is_entire_node_array_selected =
      Math.min(selection.anchor_offset, selection.focus_offset) === 0 &&
      Math.max(selection.anchor_offset, selection.focus_offset) === node_array.length;

    if (!is_entire_node_array_selected) {
      // Select the entire node_array
      tr.set_selection({
        type: 'node',
        path: node_array_path,
        anchor_offset: 0,
        focus_offset: node_array.length
      });
      return true;
    } else {
      // Entire node_array is selected, try to move up to parent node_array
      const parent_path = node_array_path.slice(0, -1);

      // Check if we have enough path segments and if parent is a valid node_array
      if (parent_path.length >= 2) {
        const is_parent_node_array = doc.inspect(parent_path.slice(0, -1))?.type === 'node_array';

        if (is_parent_node_array) {
          const parent_node_index = parseInt(parent_path.at(-1));
          tr.set_selection({
            type: 'node',
            path: parent_path.slice(0, -1),
            anchor_offset: parent_node_index,
            focus_offset: parent_node_index + 1
          });
          return true;
        }
      }
      // Stop expanding - we've reached the top level
    }
  } else if (selection.type === 'property') {
    // For property selections, select the containing node
    const node_path = selection.path.slice(0, -1);

    // Check if we have enough path segments and if we're inside a node_array
    if (node_path.length >= 2) {
      const is_inside_node_array = doc.inspect(node_path.slice(0, -1))?.type === 'node_array';

      if (is_inside_node_array) {
        const node_index = parseInt(node_path.at(-1));
        tr.set_selection({
          type: 'node',
          path: node_path.slice(0, -1),
          anchor_offset: node_index,
          focus_offset: node_index + 1
        });
        return true;
      }
    }
    // Stop expanding - property is not in a selectable node_array
  }

  return false;
}
