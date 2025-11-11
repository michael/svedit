import Command from './Command.svelte.js';
import { select_all, insert_default_node, break_text_node } from './transforms.svelte.js';

/**
 * Command that toggles a link annotation on the current text selection.
 * If a link exists, removes it. If no link exists, prompts for URL and creates one.
 */
export class ToggleLinkCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.doc.selection?.type === 'text';
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
