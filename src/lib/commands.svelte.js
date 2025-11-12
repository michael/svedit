import Command from './Command.svelte.js';
import { select_all, insert_default_node, break_text_node } from './transforms.svelte.js';
import { is_selection_collapsed, is_mobile_browser } from './util.js';

/**
 * Command that undoes the last change to the document.
 */
export class UndoCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.doc.can_undo;
	}

	execute() {
		this.context.doc.undo();
	}
}

/**
 * Command that redoes the last undone change to the document.
 */
export class RedoCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.doc.can_redo;
	}

	execute() {
		this.context.doc.redo();
	}
}

/**
 * Command that selects the parent of the current selection.
 * Useful for navigating up the document hierarchy.
 */
export class SelectParentCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.doc.selection;
	}

	execute() {
		this.context.doc.select_parent();
	}
}

/**
 * Generic command that toggles an annotation on the current text selection.
 * Used for simple annotations like bold, italic, highlight, etc.
 */
export class ToggleAnnotationCommand extends Command {
	constructor(node_type, context) {
		super(context);
		this.node_type = node_type;
	}

	active = $derived(this.is_active());

	is_active() {
		return this.context.doc.active_annotation(this.node_type);
	}

	is_enabled() {
		const { doc, editable } = this.context;
		const has_annotation = doc.active_annotation(this.node_type);
		const no_annotation_and_cursor_not_collapsed = !doc.active_annotation() && !is_selection_collapsed(doc.selection);

		return (
			editable &&
			doc.selection?.type === 'text' &&
			(has_annotation || no_annotation_and_cursor_not_collapsed)
		);
	}

	execute() {
		this.context.doc.apply(this.context.doc.tr.annotate_text(this.node_type));
	}
}

/**
 * Command that toggles a link annotation on the current text selection.
 * If a link exists, removes it. If no link exists, prompts for URL and creates one.
 */
export class ToggleLinkCommand extends Command {
	active = $derived(this.is_active());

	is_active() {
		return this.context.doc.active_annotation('link');
	}

	is_enabled() {
		const { doc, editable } = this.context;

		const can_remove_link = doc.active_annotation('link');
		const can_create_link = !doc.active_annotation() && !is_selection_collapsed(doc.selection);
		return (
			editable &&
			doc.selection?.type === 'text' &&
			(can_remove_link || can_create_link)
		);
	}

	execute() {
		const doc = this.context.doc;
		const can_create_link = doc.active_annotation('link');

		if (can_create_link) {
			// Delete link
			doc.apply(doc.tr.annotate_text('link'));
		} else {
			// Create link
			const href = window.prompt('Enter the URL', 'https://example.com');
			if (href) {
				doc.apply(doc.tr.annotate_text('link', { href }));
			}
		}
	}
}

/**
 * Command that adds a new line character at the current cursor position.
 * Only works in text selections where newlines are allowed.
 * Disabled on mobile browsers where Shift+Enter has different behavior.
 */
export class AddNewLineCommand extends Command {
	is_enabled() {
		const doc = this.context.doc;
		const selection = doc.selection;

		return (
			this.context.editable &&
			!is_mobile_browser() &&
			selection?.type === 'text' &&
			doc.inspect(selection.path).allow_newlines
		);
	}

	execute() {
		this.context.doc.apply(this.context.doc.tr.insert_text('\n'));
	}
}

/**
 * Command that breaks a text node at the cursor position.
 * Creates a new node and splits the content between the current and new node.
 * Only works in text selections.
 */
export class BreakTextNodeCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.doc.selection?.type === 'text';
	}

	execute() {
		const tr = this.context.doc.tr;
		if (break_text_node(tr)) {
			this.context.doc.apply(tr);
		}
	}
}

/**
 * Command that selects all content in the current context.
 * Progressively expands selection from text → node → parent node array.
 */
export class SelectAllCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.doc.selection;
	}

	execute() {
		const tr = this.context.doc.tr;
		select_all(tr);
		this.context.doc.apply(tr);
	}
}

/**
 * Command that inserts a default node at the current cursor position.
 * Only works when a node selection is active.
 */
export class InsertDefaultNodeCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.doc.selection?.type === 'node';
	}

	execute() {
		const tr = this.context.doc.tr;
		insert_default_node(tr);
		this.context.doc.apply(tr);
	}
}

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
			new_type_index = (current_type_index - 1 + node_array_schema.node_types.length) % node_array_schema.node_types.length;
		}

		const new_type = node_array_schema.node_types[new_type_index];
		const tr = doc.tr;
		doc.config.inserters[new_type](tr);
		tr.set_selection(old_selection);
		doc.apply(tr);
	}
}
