/**
 * Get the layout node for the current selection.
 * A layout node is a node that has a `layout` property.
 *
 * @param {import('svedit').EditorState} editor_state - The editor state instance
 * @returns {object|null} The layout node or null if none found
 */
export function get_layout_node(editor_state) {
	if (!editor_state.selected_node) return null;

	// The selected node already is a layout node
	if (editor_state.selected_node.layout) {
		return editor_state.selected_node;
	}

	// We resolve the parent node if available, and return it if it's a layout node.
	// NOTE: We only support one level atm, we may want to implement this recursively
	if (editor_state.selection.type === 'node') {
		const parent_node = editor_state.get(editor_state.selection.path.slice(0, -1));
		return parent_node.layout ? parent_node : null;
	} else {
		// We are either in a text or property (=custom) selection
		const parent_node_path = editor_state.selection?.path?.slice(0, -3);
		if (!parent_node_path) return null;
		const parent_node = editor_state.get(parent_node_path);
		return parent_node.layout ? parent_node : null;
	}
}
