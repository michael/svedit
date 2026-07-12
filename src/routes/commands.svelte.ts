import Command from '$lib/Command.svelte.js';
import { is_selection_collapsed } from '$lib/utils.js';
import type { Transaction, DocumentNode, DocumentPath } from 'svedit';
import {
	get_closest_switchable_layout,
	get_cycle_node_state,
	is_node_subtree_empty
} from './app_utils.js';

/**
 * Command that cycles through available layouts for a node.
 * Direction can be 'next' or 'previous'.
 */
export class CycleLayoutCommand extends Command {
	direction: 'next' | 'previous';

	closest_switchable_layout = $derived(
		get_closest_switchable_layout(this.context.session, this.context.session.config)
	);

	constructor(direction: 'next' | 'previous', context: any) {
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
 * Replace a node with a schema-equivalent node type while preserving property values.
 */
function replace_node_with_equivalent_type(
	tr: Transaction,
	node_array_path: DocumentPath,
	node_index: number,
	node: DocumentNode,
	new_type: string
) {
	const node_schema = tr.schema[node.type];
	const new_node: DocumentNode = {
		id: tr.generate_id(),
		type: new_type
	};

	for (const property_name of Object.keys(node_schema.properties)) {
		new_node[property_name] = structuredClone(node[property_name]);
	}

	tr.create(new_node);

	const node_array = structuredClone(tr.get(node_array_path));
	node_array.nodes[node_index] = new_node.id;
	tr.set(node_array_path, node_array);
	tr.set_selection({
		type: 'node',
		path: node_array_path,
		anchor_offset: node_index,
		focus_offset: node_index + 1
	});
}

/**
 * Command that cycles through available node types in a node array.
 * Direction can be 'next' or 'previous'.
 */
export class CycleNodeTypeCommand extends Command {
	direction: 'next' | 'previous';

	cycle_node_state = $derived(get_cycle_node_state(this.context.session));

	constructor(direction: 'next' | 'previous', context: any) {
		super(context);
		this.direction = direction;
	}

	is_enabled() {
		return this.context.editable && (this.cycle_node_state?.available_types.length ?? 0) > 0;
	}

	execute() {
		const session = this.context.session;
		const cycle_node_state = this.cycle_node_state;
		if (!cycle_node_state || cycle_node_state.available_types.length === 0) return;

		const { node, node_array_path, node_index, available_types } = cycle_node_state;
		const new_type = this.direction === 'next' ? available_types[0] : available_types.at(-1);
		if (!new_type) return;

		const tr = session.tr;
		tr.set_selection({
			type: 'node',
			path: node_array_path,
			anchor_offset: node_index,
			focus_offset: node_index + 1
		});

		if (is_node_subtree_empty(session, node)) {
			session.config.inserters[new_type](tr);
		} else {
			replace_node_with_equivalent_type(tr, node_array_path, node_index, node, new_type);
		}

		session.apply(tr);
	}
}

/**
 * Command that toggles link marks on text selections.
 * Prompts user for URL when creating a link.
 */
export class ToggleLinkCommand extends Command {
	active = $derived(this.is_active());

	is_active() {
		const selected_marks = this.context.session.selected_marks;
		return selected_marks.length === 1 && selected_marks[0].node.type === 'link';
	}

	is_enabled() {
		const { session, editable } = this.context;
		const selected_marks = session.selected_marks;
		const selection_touches_marks = selected_marks.length > 0;
		const can_remove_link = selected_marks.length === 1 && selected_marks[0].node.type === 'link';
		const can_create_link =
			!selection_touches_marks &&
			session.selection?.type === 'text' &&
			!is_selection_collapsed(session.selection);

		return Boolean(
			editable && session.selection?.type === 'text' && (can_remove_link || can_create_link)
		);
	}

	execute() {
		const session = this.context.session;
		const selected_marks = session.selected_marks;
		const can_remove_link = selected_marks.length === 1 && selected_marks[0].node.type === 'link';

		if (can_remove_link) {
			// Delete link
			session.apply(session.tr.toggle_mark('link'));
		} else {
			// Create link
			const href = window.prompt('Enter the URL', 'https://example.com');
			if (href) {
				session.apply(session.tr.toggle_mark('link', { href }));
			}
		}
	}
}
