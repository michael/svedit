import { split_annotated_string, join_annotated_string, svid, get_default_node_type } from './util.js';

export function break_text_node(tr) {
  const doc = tr.doc;
  // Keep a reference of the original selection (before any transforms are applied)
  const selection = doc.selection;
  // First we need to ensure we have a text selection
  if (!selection.type === 'text') return false;

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

  const split_at_position = doc.selection.anchor_offset;
  const content = doc.get(selection.path);
  const [left_text, right_text] = split_annotated_string(content, split_at_position);

  tr.set(doc.selection.path, left_text);

  const node_insert_position = {
    type: 'node',
    path: doc.selection.path.slice(0, -2),
    anchor_offset: parseInt(doc.selection.path.at(-2), 10) + 1,
    focus_offset: parseInt(doc.selection.path.at(-2), 10) + 1,
  };

  // TODO: Only use default_node_type when cursor is at the end of
  const node_array_schema = doc.schema[node_array_node.type][node_array_prop];
  const target_node_type = get_default_node_type(node_array_schema);

  if (!target_node_type) {
    console.warn('Cannot determine target node type for break_text_node - no default_ref_type and multiple node_types');
    return false;
  }

  tr.set_selection(node_insert_position);

  doc.config.inserters[target_node_type](tr);
  tr.set(doc.selection.path, right_text);
}

export function join_text_node(tr) {
  const doc = tr.doc;
  // Keep a reference of the original selection (before any transforms are applied)
  const selection = doc.selection;
  // First we need to ensure we have a text selection
  if (!selection.type === 'text') return false;

  const node = doc.get(selection.path.slice(0, -1));
  if (doc.kind(node) !== 'text') return false;
  const is_inside_node_array = doc.inspect(selection.path.slice(0, -2))?.type === 'node_array';
  // console.log('is_inside_node_array', is_inside_node_array);
  if (!is_inside_node_array) return false; // Do nothing if we're not inside a node_array

  const node_index = parseInt(doc.selection.path.at(-2), 10);
  if (node_index === 0) return false;
  const previous_text_path = [...doc.selection.path.slice(0, -2), node_index - 1];
  const predecessor_node = doc.get(previous_text_path);

  const joined_text = join_annotated_string(predecessor_node.content, node.content);

  tr.set_selection({
    type: 'node',
    path: doc.selection.path.slice(0, -2),
    anchor_offset: node_index,
    focus_offset: node_index + 1,
  });

  tr.delete_selection();
  tr.set_selection({
    type: 'text',
    path: [...previous_text_path, 'content'],
    anchor_offset: predecessor_node.content[0].length,
    focus_offset: predecessor_node.content[0].length,
  });
  tr.set([...previous_text_path, 'content'], joined_text);
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

  // Get the schema for this property
  const property_schema = doc.schema[node_array_node.type][property_name];
  const default_type = get_default_node_type(property_schema);

  // Only proceed if there's exactly one allowed node_type
  if (!default_type || property_schema.node_types.length !== 1) {
    return false;
  }

  // Use the inserter function if available
  if (doc.config?.inserters?.[default_type]) {
    doc.config.inserters[default_type](tr);
    return true;
  } else {
    // Fallback: create a basic node of the default type
    const new_node = {
      id: svid(),
      type: default_type
    };

    // Add default properties based on schema
    const node_schema = doc.schema[default_type];
    for (const [prop_name, prop_def] of Object.entries(node_schema)) {
      if (prop_def.type === 'annotated_string') {
        new_node[prop_name] = ['', []];
      } else if (prop_def.type === 'string') {
        new_node[prop_name] = '';
      } else if (prop_def.type === 'node_array') {
        new_node[prop_name] = [];
      } else if (prop_def.type === 'integer') {
        new_node[prop_name] = 0;
      }
      // Add other default values as needed
    }

    tr.insert_nodes([new_node]);
    return true;
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
    const text_length = text_content[0].length;

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
    const selection_length = Math.abs(selection.focus_offset - selection.anchor_offset);

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
