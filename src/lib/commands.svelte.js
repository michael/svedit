import Command from './Command.svelte.js';
import { select_all, insert_default_node } from './transforms.svelte.js';

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
