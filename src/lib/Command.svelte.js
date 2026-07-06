import { insert_default_node, break_text_node } from './transforms.svelte.js';
import {
	can_switch_mark_type,
	get_node_array_nodes,
	get_selected_range_types
} from './doc_utils.js';
import { is_selection_collapsed, get_char_length, char_slice } from './utils.js';

/**
 * Base class for commands that can be executed in response to user actions
 * like keyboard shortcuts, menu items, or toolbar buttons.
 *
 * Commands are stateful and UI-aware, unlike transforms which are pure functions.
 * They can have derived state (like is_active for toggle commands) or their own
 * state (like form inputs for prompt-based commands).
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
	/**
	 * Derived state that indicates if the command is disabled.
	 * Automatically computed from is_enabled().
	 */
	disabled = $derived(!this.is_enabled());

	/**
	 * Creates a new Command instance.
	 *
	 * @param {any} context - The context object providing access to application state
	 */
	constructor(context) {
		this.context = context;
	}

	/**
	 * Determines if the command can currently be executed.
	 * Override this method to implement command-specific logic.
	 *
	 * @returns {boolean} true if the command can be executed, false otherwise
	 */
	is_enabled() {
		return true;
	}

	/**
	 * Executes the command.
	 * Override this method to implement the command's behavior.
	 * Can be async for commands that need to perform asynchronous operations.
	 *
	 * @returns {void | Promise<void>}
	 */
	execute() {
		throw new Error('Not implemented');
	}
}

/**
 * Command that undoes the last change to the document.
 */
export class UndoCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.session.can_undo;
	}

	execute() {
		this.context.session.undo();
	}
}

/**
 * Command that redoes the last undone change to the document.
 */
export class RedoCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.session.can_redo;
	}

	execute() {
		this.context.session.redo();
	}
}

/**
 * Command that selects the parent of the current selection.
 * Useful for navigating up the document hierarchy.
 */
export class SelectParentCommand extends Command {
	is_enabled() {
		return (
			this.context.editable &&
			this.context.session.selection &&
			this.context.session.selection.path.length > 3
		);
	}

	execute() {
		this.context.session.select_parent();
	}
}

/**
 * Generic command that toggles a mark on the current text or node selection.
 *
 * Marks are mutually exclusive, so all touched marks compete: same-type marks
 * are removed, a single touched property-less mark may switch type, and mixed
 * touched types disable the command. Annotations never affect mark toggling.
 */
export class ToggleMarkCommand extends Command {
	constructor(node_type, context) {
		super(context);
		this.node_type = node_type;
	}

	active = $derived(this.is_active());

	is_active() {
		const selected_marks = this.context.session.selected_marks;
		return (
			selected_marks.length > 0 &&
			selected_marks.every(({ node }) => node?.type === this.node_type)
		);
	}

	is_enabled() {
		const { session, editable } = this.context;
		const selection = session.selection;
		const is_valid_selection =
			selection?.type === 'text' ||
			(selection?.type === 'node' && !is_selection_collapsed(selection));
		const mark_type_is_allowed = session.available_mark_types.includes(this.node_type);
		const selected_marks = session.selected_marks;
		const selected_mark_types = get_selected_range_types(selected_marks);

		if (!editable || !is_valid_selection || !mark_type_is_allowed) return false;
		if (selected_mark_types.size > 1) return false;

		if (selected_marks.length === 0) {
			return Boolean(selection && !is_selection_collapsed(selection));
		}

		const first_selected_mark = selected_marks[0];
		const selected_mark_type = first_selected_mark.node.type;
		if (selected_mark_type === this.node_type) return true;
		if (selected_marks.length !== 1) return false;

		return can_switch_mark_type(session.schema, selected_mark_type, this.node_type);
	}

	execute() {
		this.context.session.apply(this.context.session.tr.toggle_mark(this.node_type));
	}
}

/**
 * Generic command that toggles an annotation on the current text or node selection.
 *
 * Annotations only compete with touched annotations of the same type: touched
 * same-type annotations are removed, otherwise a new annotation is created.
 * Marks and other annotation types never block the toggle.
 */
export class ToggleAnnotationCommand extends Command {
	constructor(node_type, context) {
		super(context);
		this.node_type = node_type;
	}

	active = $derived(this.is_active());

	// Mirrors the filter in tr.toggle_annotation, so active/enabled match what
	// execute() does.
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
		const selection = session.selection;
		const is_valid_selection =
			selection?.type === 'text' ||
			(selection?.type === 'node' && !is_selection_collapsed(selection));
		const annotation_type_is_allowed = session.available_annotation_types.includes(this.node_type);

		if (!editable || !is_valid_selection || !annotation_type_is_allowed) return false;

		// Removing touched same-type annotations also works from a collapsed
		// caret inside the annotation; creating a new one requires an expanded
		// selection.
		if (this.relevant_annotations().length > 0) return true;
		return Boolean(selection && !is_selection_collapsed(selection));
	}

	execute() {
		this.context.session.apply(this.context.session.tr.toggle_annotation(this.node_type));
	}
}

/**
 * Command that adds a new line character at the current caret position.
 * Only works in text selections where newlines are allowed.
 */
export class AddNewLineCommand extends Command {
	is_enabled() {
		const session = this.context.session;
		const selection = session.selection;

		return (
			this.context.editable &&
			selection?.type === 'text' &&
			session.inspect(selection.path).allow_newlines
		);
	}

	execute() {
		const session = this.context.session;
		const selection = session.selection;
		if (!selection || selection.type !== 'text') return;
		if (!session.inspect(selection.path).allow_newlines) return;

		const tr = session.tr;
		if (selection.anchor_offset !== selection.focus_offset) {
			tr.delete_selection();
		}

		const collapsed_offset = tr.selection.anchor_offset;
		const content = tr.get(tr.selection.path);
		const text_before_caret = char_slice(content.content, 0, collapsed_offset);
		const line_start_index = text_before_caret.lastIndexOf('\n') + 1;
		const current_line_prefix = text_before_caret.slice(line_start_index);
		const indentation_match = current_line_prefix.match(/^[\t ]*/);
		const indentation = indentation_match ? indentation_match[0] : '';

		tr.insert_text(`\n${indentation}`);
		session.apply(tr);
	}
}

/**
 * Command that breaks a text node at the caret position.
 * Creates a new node and splits the content between the current and new node.
 * Only works in text selections.
 */
export class BreakTextNodeCommand extends Command {
	is_enabled() {
		const session = this.context.session;
		const selection = session.selection;
		if (!this.context.editable || selection?.type !== 'text') return false;

		const owner_node = session.get(selection.path.slice(0, -1));
		const owner_node_schema = owner_node ? session.schema[owner_node.type] : null;
		if (!owner_node_schema || owner_node_schema.kind !== 'text') return false;

		return session.inspect(selection.path.slice(0, -2))?.type === 'node_array';
	}

	execute() {
		const tr = this.context.session.tr;
		if (break_text_node(tr)) {
			this.context.session.apply(tr);
		}
	}
}

/**
 * Command that selects all content in the current context.
 * Progressively expands selection from text → node → parent node array.
 */
export class SelectAllCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.session.selection;
	}

	execute() {
		const session = this.context.session;
		const selection = session.selection;

		if (!selection) {
			return;
		}

		if (selection.type === 'text') {
			const text_content = session.get(selection.path);
			const text_length = get_char_length(text_content.content);

			// Check if all text is already selected
			const is_all_text_selected =
				Math.min(selection.anchor_offset, selection.focus_offset) === 0 &&
				Math.max(selection.anchor_offset, selection.focus_offset) === text_length;

			if (!is_all_text_selected) {
				// Select all text in the current text node
				session.selection = {
					type: 'text',
					path: selection.path,
					anchor_offset: 0,
					focus_offset: text_length
				};
			} else {
				// All text is selected, move up to select the containing node
				const node_path = selection.path.slice(0, -1); // Remove the property name (e.g., 'content')

				// Check if we have enough path segments and if we're inside a node_array
				if (node_path.length >= 2) {
					const is_inside_node_array =
						session.inspect(node_path.slice(0, -1))?.type === 'node_array';

					if (is_inside_node_array) {
						const node_index = parseInt(node_path.at(-1));
						session.selection = {
							type: 'node',
							path: node_path.slice(0, -1),
							anchor_offset: node_index,
							focus_offset: node_index + 1
						};
					}
				}
				// Stop expanding - text is not in a selectable node_array
			}
		} else if (selection.type === 'node') {
			const node_array_path = selection.path;
			const node_array = session.get(node_array_path);
			const node_array_nodes = get_node_array_nodes(node_array);

			// Check if the entire node_array is already selected
			const is_entire_node_array_selected =
				Math.min(selection.anchor_offset, selection.focus_offset) === 0 &&
				Math.max(selection.anchor_offset, selection.focus_offset) === node_array_nodes.length;

			if (!is_entire_node_array_selected) {
				// Select the entire node_array
				session.selection = {
					type: 'node',
					path: node_array_path,
					anchor_offset: 0,
					focus_offset: node_array_nodes.length
				};
			} else {
				// Entire node_array is selected, try to move up to parent node_array
				const parent_path = node_array_path.slice(0, -1);

				// Check if we have enough path segments and if parent is a valid node_array
				if (parent_path.length >= 2) {
					const is_parent_node_array =
						session.inspect(parent_path.slice(0, -1))?.type === 'node_array';

					if (is_parent_node_array) {
						const parent_node_index = parseInt(parent_path.at(-1));
						session.selection = {
							type: 'node',
							path: parent_path.slice(0, -1),
							anchor_offset: parent_node_index,
							focus_offset: parent_node_index + 1
						};
					}
				}
				// Stop expanding - we've reached the top level
			}
		} else if (selection.type === 'property') {
			// For property selections, select the containing node
			const node_path = selection.path.slice(0, -1);

			// Check if we have enough path segments and if we're inside a node_array
			if (node_path.length >= 2) {
				const is_inside_node_array = session.inspect(node_path.slice(0, -1))?.type === 'node_array';

				if (is_inside_node_array) {
					const node_index = parseInt(node_path.at(-1));
					session.selection = {
						type: 'node',
						path: node_path.slice(0, -1),
						anchor_offset: node_index,
						focus_offset: node_index + 1
					};
				}
			}
			// Stop expanding - property is not in a selectable node_array
		}
	}
}

/**
 * Command that inserts a default node at the current caret position.
 * Only works when a collapsed node selection is active.
 */
export class InsertDefaultNodeCommand extends Command {
	is_enabled() {
		const selection = this.context.session.selection;
		return (
			this.context.editable &&
			selection?.type === 'node' &&
			selection.anchor_offset === selection.focus_offset
		);
	}

	execute() {
		const tr = this.context.session.tr;
		insert_default_node(tr);
		this.context.session.apply(tr);
	}
}
