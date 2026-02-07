import Command from '$lib/Command.svelte.js';
import { is_selection_collapsed } from '$lib/utils.js';
import { get_layout_node } from './app_utils.js';

/**
 * Command that cycles through available layouts for a node.
 * Direction can be 'next' or 'previous'.
 */
export class CycleLayoutCommand extends Command {
	layout_node = $derived(get_layout_node(this.context.session));

	constructor(direction, context) {
		super(context);
		this.direction = direction;
	}

	is_enabled() {
		if (!this.context.editable || !this.layout_node) return false;

		const layout_count = this.context.session.config.node_layouts?.[this.layout_node.type];
		return layout_count > 1 && this.layout_node?.layout;
	}

	execute() {
		const session = this.context.session;
		const node = this.layout_node;
		const layout_count = session.config.node_layouts[node.type];

		let new_layout;
		if (this.direction === 'next') {
			new_layout = (node.layout % layout_count) + 1;
		} else {
			new_layout = ((node.layout - 2 + layout_count) % layout_count) + 1;
		}

		const tr = session.tr;
		tr.set([node.id, 'layout'], new_layout);
		session.apply(tr);
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
		const session = this.context.session;

		if (!this.context.editable || !session.selection) return false;

		// Need to check if we have a node selection or can select parent
		let selection = session.selection;
		if (selection.type !== 'node') {
			// Would need to select parent first
			return true; // Let execute handle this
		}

		const node_array_schema = session.inspect(selection.path);
		if (node_array_schema.type !== 'node_array') return false;

		// Need at least 2 types to cycle
		return node_array_schema.node_types?.length > 1;
	}

	execute() {
		const session = this.context.session;

		// Ensure we have a node selection
		if (session.selection.type !== 'node') {
			session.select_parent();
		}

		const node = session.selected_node;
		const old_selection = structuredClone(session.selection);
		const node_array_schema = session.inspect(session.selection.path);

		// If we are not dealing with a node selection in a container, return
		if (node_array_schema.type !== 'node_array') return;

		// Do nothing if there's only one type to switch to
		if (node_array_schema.node_types?.length <= 1) return;

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
		const tr = session.tr;
		session.config.inserters[new_type](tr);
		tr.set_selection(old_selection);
		session.apply(tr);
	}
}

export class ResetImageCommand extends Command {
	is_enabled() {
		const session = this.context.session;
		if (!this.context.editable || session.selection.type !== 'property') return false;
		const property_definition = session.inspect(session.selection.path);
		return property_definition.name === 'image';
	}

	execute() {
		const session = this.context.session;
		const tr = session.tr;
		tr.set(session.selection.path, '');
		session.apply(tr);
	}
}

/**
 * Command that toggles link annotations on text selections.
 * Prompts user for URL when creating a link.
 */
export class ToggleLinkCommand extends Command {
	active = $derived(this.is_active());

	is_active() {
		return this.context.session.active_annotation('link');
	}

	is_enabled() {
		const { session, editable } = this.context;

		const can_remove_link = session.active_annotation('link');
		const can_create_link =
			!session.active_annotation() && !is_selection_collapsed(session.selection);
		return editable && session.selection?.type === 'text' && (can_remove_link || can_create_link);
	}

	execute() {
		const session = this.context.session;
		const can_remove_link = session.active_annotation('link');

		if (can_remove_link) {
			// Delete link
			session.apply(session.tr.annotate_text('link'));
		} else {
			// Create link
			const href = window.prompt('Enter the URL', 'https://example.com');
			if (href) {
				session.apply(session.tr.annotate_text('link', { href }));
			}
		}
	}
}
