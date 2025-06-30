import { split_annotated_text } from './util.js';


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
  const target_node_type = doc.schema[container_node.type][container_prop].default_ref_type;
  tr.set_selection(container_insert_position);

  doc.config.inserters[target_node_type](tr);
  tr.set(doc.selection.path, right_text);
}
