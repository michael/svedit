import Command from '$lib/Command.svelte.js';
import { is_selection_collapsed } from '$lib/util.js';
import { get_layout_node } from './app_utils.js';

/**
 * Command that cycles through available layouts for a node.
 * Direction can be 'next' or 'previous'.
 */
export class CycleLayoutCommand extends Command {
	layout_node = $derived(get_layout_node(this.context.editor_state));

	constructor(direction, context) {
		super(context);
		this.direction = direction;
	}

	is_enabled() {
		if (!this.context.editable || !this.layout_node) return false;

		const layout_count = this.context.editor_state.config.node_layouts?.[this.layout_node.type];
		return layout_count > 1 && this.layout_node?.layout;
	}

	execute() {
		const editor_state = this.context.editor_state;
		const node = this.layout_node;
		const layout_count = editor_state.config.node_layouts[node.type];

		let new_layout;
		if (this.direction === 'next') {
			new_layout = (node.layout % layout_count) + 1;
		} else {
			new_layout = ((node.layout - 2 + layout_count) % layout_count) + 1;
		}

		const tr = editor_state.tr;
		tr.set([node.id, 'layout'], new_layout);
		editor_state.apply(tr);
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
		const editor_state = this.context.editor_state;

		if (!this.context.editable || !editor_state.selection) return false;

		// Need to check if we have a node selection or can select parent
		let selection = editor_state.selection;
		if (selection.type !== 'node') {
			// Would need to select parent first
			return true; // Let execute handle this
		}

		const node_array_schema = editor_state.inspect(selection.path);
		if (node_array_schema.type !== 'node_array') return false;

		// Need at least 2 types to cycle
		return node_array_schema.node_types?.length > 1;
	}

	execute() {
		const editor_state = this.context.editor_state;

		// Ensure we have a node selection
		if (editor_state.selection.type !== 'node') {
			editor_state.select_parent();
		}

		const node = editor_state.selected_node;
		const old_selection = structuredClone(editor_state.selection);
		const node_array_schema = editor_state.inspect(editor_state.selection.path);

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
		const tr = editor_state.tr;
		editor_state.config.inserters[new_type](tr);
		tr.set_selection(old_selection);
		editor_state.apply(tr);
	}
}

export class ResetImageCommand extends Command {
	is_enabled() {
		const editor_state = this.context.editor_state;
		if (!this.context.editable || editor_state.selection.type !== 'property') return false;
		const property_definition = editor_state.inspect(editor_state.selection.path);
		return property_definition.name === 'image';
	}

	execute() {
		const editor_state = this.context.editor_state;
		const tr = editor_state.tr;
		tr.set(editor_state.selection.path, '');
		editor_state.apply(tr);
	}
}

/**
 * Command that toggles link annotations on text selections.
 * Prompts user for URL when creating a link.
 */
export class ToggleLinkCommand extends Command {
	active = $derived(this.is_active());

	is_active() {
		return this.context.editor_state.active_annotation('link');
	}

	is_enabled() {
		const { editor_state, editable } = this.context;

		const can_remove_link = editor_state.active_annotation('link');
		const can_create_link =
			!editor_state.active_annotation() && !is_selection_collapsed(editor_state.selection);
		return (
			editable && editor_state.selection?.type === 'text' && (can_remove_link || can_create_link)
		);
	}

	execute() {
		const editor_state = this.context.editor_state;
		const can_create_link = editor_state.active_annotation('link');

		if (can_create_link) {
			// Delete link
			editor_state.apply(editor_state.tr.annotate_text('link'));
		} else {
			// Create link
			const href = window.prompt('Enter the URL', 'https://example.com');
			if (href) {
				editor_state.apply(editor_state.tr.annotate_text('link', { href }));
			}
		}
	}
}
