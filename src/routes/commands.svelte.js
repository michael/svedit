import Command from '$lib/Command.svelte.js';

/**
 * Command that cycles through available layouts for a node.
 * Direction can be 'next' or 'previous'.
 */
export class CycleLayoutCommand extends Command {
	constructor(direction, context) {
		super(context);
		this.direction = direction;
	}

	is_enabled() {
		const doc = this.context.doc;
		const layout_node = doc.layout_node;

		if (!this.context.editable || !layout_node) return false;

		const layout_count = doc.config.node_layouts?.[layout_node.type];
		return layout_count > 1 && layout_node?.layout;
	}

	execute() {
		const doc = this.context.doc;
		const node = doc.layout_node;
		const layout_count = doc.config.node_layouts[node.type];

		let new_layout;
		if (this.direction === 'next') {
			new_layout = (node.layout % layout_count) + 1;
		} else {
			new_layout = ((node.layout - 2 + layout_count) % layout_count) + 1;
		}

		const tr = doc.tr;
		tr.set([node.id, 'layout'], new_layout);
		doc.apply(tr);
	}
}

/**
 * Command that cycles through available node types in a node array.
 * Direction can be 'next' or 'previous'.
 */
export class CycleNodeTypeCommand extends Command {
	constructor(direction, context) {
		super(context);
		this.direction = direction;
	}

	is_enabled() {
		const doc = this.context.doc;

		if (!this.context.editable || !doc.selection) return false;

		// Need to check if we have a node selection or can select parent
		let selection = doc.selection;
		if (selection.type !== 'node') {
			// Would need to select parent first
			return true; // Let execute handle this
		}

		const node_array_schema = doc.inspect(selection.path);
		if (node_array_schema.type !== 'node_array') return false;

		// Need at least 2 types to cycle
		return node_array_schema.node_types?.length > 1;
	}

	execute() {
		const doc = this.context.doc;

		// Ensure we have a node selection
		if (doc.selection.type !== 'node') {
			doc.select_parent();
		}

		const node = doc.selected_node;
		const old_selection = structuredClone(doc.selection);
		const node_array_schema = doc.inspect(doc.selection.path);

		// If we are not dealing with a node selection in a container, return
		if (node_array_schema.type !== 'node_array') return;

		const current_type_index = node_array_schema.node_types.indexOf(node.type);
		let new_type_index;

		if (this.direction === 'next') {
			new_type_index = (current_type_index + 1) % node_array_schema.node_types.length;
		} else {
			new_type_index =
				(current_type_index - 1 + node_array_schema.node_types.length) %
				node_array_schema.node_types.length;
		}

		const new_type = node_array_schema.node_types[new_type_index];
		const tr = doc.tr;
		doc.config.inserters[new_type](tr);
		tr.set_selection(old_selection);
		doc.apply(tr);
	}
}
