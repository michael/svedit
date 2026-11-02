import { insert_default_node, break_text_node } from './transforms.svelte.js';
import { can_switch_mark_type, get_selected_range_types } from './doc_utils.js';
import {
	is_selection_collapsed,
	get_char_length,
	char_slice,
	get_selection_range
} from './utils.js';
import type Session from './Session.svelte.js';
import type { Selection } from './types.js';

// Commands operate on sessions with arbitrary application schemas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandSession = Session<any>;

export type CommandContext = {
	session: CommandSession;
	editable: boolean;
};

/**
 * Base class for commands executed in response to user actions such as
 * keyboard shortcuts, menu items or toolbar buttons.
 *
 * Commands are stateful and UI-aware, unlike transforms, which are pure
 * functions. They can have derived state (like is_active for toggle
 * commands) or their own state (like form inputs for prompt-based commands).
 *
 * @example
 * ```js
 * class SaveCommand extends Command {
 *   is_enabled() {
 *     return this.context.editable;
 *   }
 *
 *   async execute() {
 *     await update_document(this.context.session);
 *     this.context.editable = false;
 *   }
 * }
 * ```
 */
export default class Command {
	context: CommandContext;

	/** Whether the command is disabled, derived from is_enabled(). */
	disabled = $derived(!this.is_enabled());

	constructor(context: CommandContext) {
		this.context = context;
	}

	/** Whether the command can currently be executed. */
	is_enabled(): boolean {
		return true;
	}

	/** Executes the command. Can be async. */
	execute(): void | Promise<void> {
		throw new Error('Not implemented');
	}
}

/** A text selection, or a node selection that is not collapsed. */
function is_expandable_selection(selection: Selection | null): boolean {
	return (
		selection?.type === 'text' || (selection?.type === 'node' && !is_selection_collapsed(selection))
	);
}

/** Undoes the last change to the document. */
export class UndoCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.session.can_undo;
	}

	execute() {
		this.context.session.undo();
	}
}

/** Redoes the last undone change to the document. */
export class RedoCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.session.can_redo;
	}

	execute() {
		this.context.session.redo();
	}
}

/** Selects the parent of the current selection. */
export class SelectParentCommand extends Command {
	is_enabled() {
		const selection = this.context.session.selection;
		return Boolean(this.context.editable && selection && selection.path.length > 3);
	}

	execute() {
		this.context.session.select_parent();
	}
}

/**
 * Toggles a mark on the current text or node selection. All touched marks
 * compete, since marks are mutually exclusive: same-type marks are removed,
 * a single touched property-less mark may switch type, and mixed touched
 * types disable the command. Annotations never affect mark toggling.
 */
export class ToggleMarkCommand extends Command {
	node_type: string;
	active = $derived(this.is_active());

	constructor(node_type: string, context: CommandContext) {
		super(context);
		this.node_type = node_type;
	}

	is_active() {
		const marks = this.context.session.selected_marks;
		return marks.length > 0 && marks.every(({ node }) => node?.type === this.node_type);
	}

	is_enabled() {
		const { session, editable } = this.context;
		if (!editable || !is_expandable_selection(session.selection)) return false;
		if (!session.available_mark_types.includes(this.node_type)) return false;
		const marks = session.selected_marks;
		if (get_selected_range_types(marks).size > 1) return false;
		if (marks.length === 0) return !is_selection_collapsed(session.selection);
		const mark_type = marks[0].node.type;
		if (mark_type === this.node_type) return true;
		return marks.length === 1 && can_switch_mark_type(session.schema, mark_type, this.node_type);
	}

	execute() {
		const { session } = this.context;
		session.apply(session.tr.toggle_mark(this.node_type));
	}
}

/**
 * Toggles an annotation on the current text or node selection. Only touched
 * annotations of the same type compete: they are removed, otherwise a new
 * annotation is created. Marks and other annotation types never block it.
 */
export class ToggleAnnotationCommand extends Command {
	node_type: string;
	active = $derived(this.is_active());

	constructor(node_type: string, context: CommandContext) {
		super(context);
		this.node_type = node_type;
	}

	/** Touched annotations of this type, mirroring tr.toggle_annotation. */
	relevant_annotations() {
		return this.context.session.selected_annotations.filter(
			({ node }) => node?.type === this.node_type
		);
	}

	is_active() {
		return this.relevant_annotations().length > 0;
	}

	is_enabled() {
		const { session, editable } = this.context;
		if (!editable || !is_expandable_selection(session.selection)) return false;
		if (!session.available_annotation_types.includes(this.node_type)) return false;
		// Removing also works from a collapsed caret; creating needs a range
		return this.relevant_annotations().length > 0 || !is_selection_collapsed(session.selection);
	}

	execute() {
		const { session } = this.context;
		session.apply(session.tr.toggle_annotation(this.node_type));
	}
}

/**
 * Inserts a newline at the caret, keeping the current line's indentation.
 * Only works in text properties that allow newlines.
 */
export class AddNewLineCommand extends Command {
	is_enabled() {
		const { session, editable } = this.context;
		const selection = session.selection;
		return editable && selection?.type === 'text' && session.inspect(selection.path).allow_newlines;
	}

	execute() {
		const { session } = this.context;
		const selection = session.selection;
		if (selection?.type !== 'text' || !session.inspect(selection.path).allow_newlines) return;
		const tr = session.tr;
		if (!is_selection_collapsed(selection)) tr.delete_selection();
		if (tr.selection.type !== 'text') return;
		const text_before_caret = char_slice(
			tr.get(tr.selection.path).content,
			0,
			tr.selection.anchor_offset
		);
		const current_line = text_before_caret.slice(text_before_caret.lastIndexOf('\n') + 1);
		tr.insert_text(`\n${current_line.match(/^[\t ]*/)![0]}`);
		session.apply(tr);
	}
}

/**
 * Breaks a text node at the caret, splitting its content between the
 * current and a new node. Only works in text nodes inside a node array.
 */
export class BreakTextNodeCommand extends Command {
	is_enabled() {
		const { session, editable } = this.context;
		const selection = session.selection;
		if (!editable || selection?.type !== 'text' || selection.path.length < 3) return false;
		const owner = session.get(selection.path.slice(0, -1));
		if (!owner || session.schema[owner.type]?.kind !== 'text') return false;
		return session.inspect(selection.path.slice(0, -2))?.type === 'node_array';
	}

	execute() {
		const tr = this.context.session.tr;
		if (break_text_node(tr)) this.context.session.apply(tr);
	}
}

/**
 * Selects all content of the current context, then expands step by step:
 * text → node → parent node array.
 */
export class SelectAllCommand extends Command {
	is_enabled() {
		return Boolean(this.context.editable && this.context.session.selection);
	}

	execute() {
		const { session } = this.context;
		const selection = session.selection;
		if (!selection) return;

		if (selection.type !== 'property') {
			const value = session.get(selection.path);
			const length =
				selection.type === 'text' ? get_char_length(value.content) : value.nodes.length;
			const { start_offset, end_offset } = get_selection_range(selection)!;
			if (start_offset !== 0 || end_offset !== length) {
				session.selection = {
					type: selection.type,
					path: selection.path,
					anchor_offset: 0,
					focus_offset: length
				};
				return;
			}
		}

		// Everything is selected, so select the node owning the property
		const node_path = selection.path.slice(0, -1);
		if (node_path.length >= 2 && session.inspect(node_path.slice(0, -1))?.type === 'node_array') {
			const index = node_path.at(-1) as number;
			session.selection = {
				type: 'node',
				path: node_path.slice(0, -1),
				anchor_offset: index,
				focus_offset: index + 1
			};
		}
	}
}

/** Inserts a default node at a collapsed node caret. */
export class InsertDefaultNodeCommand extends Command {
	is_enabled() {
		const selection = this.context.session.selection;
		return this.context.editable && selection?.type === 'node' && is_selection_collapsed(selection);
	}

	execute() {
		const tr = this.context.session.tr;
		insert_default_node(tr);
		this.context.session.apply(tr);
	}
}
