import Command from './Command.svelte.js';
import { select_all, insert_default_node, break_text_node } from './transforms.svelte.js';
import { is_selection_collapsed } from './util.js';

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

		const has_link = doc.active_annotation('link'); // toggle to disable
		const no_annotation_and_cursor_not_collapsed = !doc.active_annotation() && !is_selection_collapsed(doc.selection);
		return (
			editable &&
			doc.selection?.type === 'text' &&
			(has_link || no_annotation_and_cursor_not_collapsed)
		);
	}

	execute() {
		const doc = this.context.doc;
		const has_link = doc.active_annotation('link');

		if (has_link) {
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
 */
export class AddNewLineCommand extends Command {
	is_enabled() {
		const doc = this.context.doc;
		const selection = doc.selection;

		return (
			this.context.editable &&
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
