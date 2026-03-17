import Command from '$lib/Command.svelte.js';
import { is_selection_collapsed } from '$lib/utils.js';
import { get_closest_switchable_layout, get_closest_switchable_type } from './app_utils.js';

/**
 * Command that cycles through available layouts for a node.
 * Direction can be 'next' or 'previous'.
 */
export class CycleLayoutCommand extends Command {
	closest_switchable_layout = $derived(get_closest_switchable_layout(this.context.session, this.context.session.config));

	constructor(direction, context) {
		super(context);
		this.direction = direction;
	}

	is_enabled() {
		return this.context.editable && this.closest_switchable_layout !== null;
	}

	execute() {
		const session = this.context.session;
		const { node, node_array_path, node_index } = this.closest_switchable_layout;
		const layout_count = session.config.node_layouts[node.type];

		let new_layout;
		if (this.direction === 'next') {
			new_layout = (node.layout % layout_count) + 1;
		} else {
			new_layout = ((node.layout - 2 + layout_count) % layout_count) + 1;
		}

		const tr = session.tr;
		// Set node selection so it's clear which node's layout changed
		tr.set_selection({
			type: 'node',
			path: node_array_path,
			anchor_offset: node_index,
			focus_offset: node_index + 1
		});
		tr.set([node.id, 'layout'], new_layout);
		session.apply(tr);
	}
}

/**
 * Command that cycles through available node types in a node array.
 * Direction can be 'next' or 'previous'.
 */
export class CycleNodeTypeCommand extends Command {
	closest_switchable_type = $derived(get_closest_switchable_type(this.context.session));

	constructor(direction, context) {
		super(context);
		this.direction = direction;
	}

	is_enabled() {
		return this.context.editable && this.closest_switchable_type !== null;
	}

	execute() {
		const session = this.context.session;
		const { node, node_array_path, node_index } = this.closest_switchable_type;
		const node_array_schema = session.inspect(node_array_path);
		const node_types = node_array_schema.node_types;

		const current_type_index = node_types.indexOf(node.type);
		let new_type_index;

		if (this.direction === 'next') {
			new_type_index = (current_type_index + 1) % node_types.length;
		} else {
			new_type_index = (current_type_index - 1 + node_types.length) % node_types.length;
		}

		const new_type = node_types[new_type_index];
		const tr = session.tr;
		// Set the selection inside the transaction so undo/redo replays correctly
		tr.set_selection({
			type: 'node',
			path: node_array_path,
			anchor_offset: node_index,
			focus_offset: node_index + 1
		});
		session.config.inserters[new_type](tr);
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
