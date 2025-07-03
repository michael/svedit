import { split_annotated_text, join_annotated_text, svid, get_default_ref_type } from './util.js';

export function break_text_node(tr) {
  const doc = tr.doc;
  // Keep a reference of the original selection (before any transforms are applied)
  const selection = doc.selection;
  // First we need to ensure we have a text selection
  if (!selection.type === 'text') return false;

  // "path": [
  //   "atzVDeKmJwyzGZzfmmXPSkx",
  //   "body",
  //   "2",
  //   "description"
  // ],
  //

  // Next, we need to determine if the enclosing block is a pure text node (e.g. paragraph),
  // which is wrapped inside a container (e.g. page.body)

  // Owner of the text property (e.g. paragraph)
  const node = doc.get(selection.path.slice(0, -1));
  if (doc.kind(node) !== 'text') return false;
  const is_inside_container = doc.inspect(selection.path.slice(0, -2))?.type === 'multiref';
  // console.log('is_inside_container', is_inside_container);
  if (!is_inside_container) return false; // Do nothing if we're not inside a container
  const container_prop = selection.path.at(-3);
  // console.log('container_prop', container_prop);
  // Get the node that owns the container property (e.g. a page.body)
  const container_node = doc.get(selection.path.slice(0, -3));
  // console.log('container_node', $state.snapshot(container_node));

  // Delete selection unless collapsed
  if (selection.anchor_offset !== selection.focus_offset) {
    tr.delete_selection();
  }

  const split_at_position = doc.selection.anchor_offset;
  const content = doc.get(selection.path);
  const [left_text, right_text] = split_annotated_text(content, split_at_position);

  tr.set(doc.selection.path, left_text);

  const container_insert_position = {
    type: 'container',
    path: doc.selection.path.slice(0, -2),
    anchor_offset: parseInt(doc.selection.path.at(-2), 10) + 1,
    focus_offset: parseInt(doc.selection.path.at(-2), 10) + 1,
  };

  // TODO: Only use default_ref_type when cursor is at the end of
  const container_schema = doc.schema[container_node.type][container_prop];
  const target_node_type = get_default_ref_type(container_schema);
  
  if (!target_node_type) {
    console.warn('Cannot determine target node type for break_text_node - no default_ref_type and multiple ref_types');
    return false;
  }
  
  tr.set_selection(container_insert_position);

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
  const is_inside_container = doc.inspect(selection.path.slice(0, -2))?.type === 'multiref';
  // console.log('is_inside_container', is_inside_container);
  if (!is_inside_container) return false; // Do nothing if we're not inside a container

  const node_index = parseInt(doc.selection.path.at(-2), 10);
  if (node_index === 0) return false;
  const previous_text_path = [...doc.selection.path.slice(0, -2), node_index - 1];
  const predecessor_node = doc.get(previous_text_path);

  const joined_text = join_annotated_text(predecessor_node.content, node.content);

  tr.set_selection({
    type: 'container',
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
  
  // Only work with collapsed container selections
  if (selection?.type !== 'container' || selection.anchor_offset !== selection.focus_offset) {
    return false;
  }
  
  const path = selection.path;
  const container_node = doc.get(path.slice(0, -1));
  const property_name = path.at(-1);
  
  // Get the schema for this property
  const property_schema = doc.schema[container_node.type][property_name];
  const default_type = get_default_ref_type(property_schema);
  
  // Only proceed if there's exactly one allowed ref_type
  if (!default_type || property_schema.ref_types.length !== 1) {
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
      if (prop_def.type === 'annotated_text') {
        new_node[prop_name] = ['', []];
      } else if (prop_def.type === 'string') {
        new_node[prop_name] = '';
      } else if (prop_def.type === 'multiref') {
        new_node[prop_name] = [];
      } else if (prop_def.type === 'integer') {
        new_node[prop_name] = 0;
      }
      // Add other default values as needed
    }
    
    tr.insert_blocks([new_node]);
    return true;
  }
}
