import { insert_default_node, break_text_node } from './transforms.svelte.js';
import { is_selection_collapsed, is_mobile_browser, get_char_length } from './util.js';

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
 *     await update_document(this.context.doc);
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
		return this.context.editable && this.context.editor_state.can_undo;
	}

	execute() {
		this.context.editor_state.undo();
	}
}

/**
 * Command that redoes the last undone change to the document.
 */
export class RedoCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.editor_state.can_redo;
	}

	execute() {
		this.context.editor_state.redo();
	}
}

/**
 * Command that selects the parent of the current selection.
 * Useful for navigating up the document hierarchy.
 */
export class SelectParentCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.editor_state.selection;
	}

	execute() {
		this.context.editor_state.select_parent();
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
		return this.context.editor_state.active_annotation(this.node_type);
	}

	is_enabled() {
		const { editor_state, editable } = this.context;
		const has_annotation = editor_state.active_annotation(this.node_type);
		const no_annotation_and_cursor_not_collapsed =
			!editor_state.active_annotation() && !is_selection_collapsed(editor_state.selection);

		return (
			editable &&
			editor_state.selection?.type === 'text' &&
			(has_annotation || no_annotation_and_cursor_not_collapsed)
		);
	}

	execute() {
		this.context.editor_state.apply(this.context.editor_state.tr.annotate_text(this.node_type));
	}
}

/**
 * Command that adds a new line character at the current cursor position.
 * Only works in text selections where newlines are allowed.
 * Disabled on mobile browsers where Shift+Enter has different behavior.
 */
export class AddNewLineCommand extends Command {
	is_enabled() {
		const editor_state = this.context.editor_state;
		const selection = editor_state.selection;

		return (
			this.context.editable &&
			!is_mobile_browser() &&
			selection?.type === 'text' &&
			editor_state.inspect(selection.path).allow_newlines
		);
	}

	execute() {
		this.context.editor_state.apply(this.context.editor_state.tr.insert_text('\n'));
	}
}

/**
 * Command that breaks a text node at the cursor position.
 * Creates a new node and splits the content between the current and new node.
 * Only works in text selections.
 */
export class BreakTextNodeCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.editor_state.selection?.type === 'text';
	}

	execute() {
		const tr = this.context.editor_state.tr;
		if (break_text_node(tr)) {
			this.context.editor_state.apply(tr);
		}
	}
}

/**
 * Command that selects all content in the current context.
 * Progressively expands selection from text → node → parent node array.
 */
export class SelectAllCommand extends Command {
	is_enabled() {
		return this.context.editable && this.context.editor_state.selection;
	}

	execute() {
		const editor_state = this.context.editor_state;
		const selection = editor_state.selection;

		if (!selection) {
			return;
		}

		if (selection.type === 'text') {
			const text_content = editor_state.get(selection.path);
			const text_length = get_char_length(text_content.text);

			// Check if all text is already selected
			const is_all_text_selected =
				Math.min(selection.anchor_offset, selection.focus_offset) === 0 &&
				Math.max(selection.anchor_offset, selection.focus_offset) === text_length;

			if (!is_all_text_selected) {
				// Select all text in the current text node
				editor_state.selection = {
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
						editor_state.inspect(node_path.slice(0, -1))?.type === 'node_array';

					if (is_inside_node_array) {
						const node_index = parseInt(node_path.at(-1));
						editor_state.selection = {
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
			const node_array = editor_state.get(node_array_path);

			// Check if the entire node_array is already selected
			const is_entire_node_array_selected =
				Math.min(selection.anchor_offset, selection.focus_offset) === 0 &&
				Math.max(selection.anchor_offset, selection.focus_offset) === node_array.length;

			if (!is_entire_node_array_selected) {
				// Select the entire node_array
				editor_state.selection = {
					type: 'node',
					path: node_array_path,
					anchor_offset: 0,
					focus_offset: node_array.length
				};
			} else {
				// Entire node_array is selected, try to move up to parent node_array
				const parent_path = node_array_path.slice(0, -1);

				// Check if we have enough path segments and if parent is a valid node_array
				if (parent_path.length >= 2) {
					const is_parent_node_array =
						editor_state.inspect(parent_path.slice(0, -1))?.type === 'node_array';

					if (is_parent_node_array) {
						const parent_node_index = parseInt(parent_path.at(-1));
						editor_state.selection = {
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
				const is_inside_node_array =
					editor_state.inspect(node_path.slice(0, -1))?.type === 'node_array';

				if (is_inside_node_array) {
					const node_index = parseInt(node_path.at(-1));
					editor_state.selection = {
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
 * Command that inserts a default node at the current cursor position.
 * Only works when a collapsed node selection is active.
 */
export class InsertDefaultNodeCommand extends Command {
	is_enabled() {
		const selection = this.context.editor_state.selection;
		return (
			this.context.editable &&
			selection?.type === 'node' &&
			selection.anchor_offset === selection.focus_offset
		);
	}

	execute() {
		const tr = this.context.editor_state.tr;
		insert_default_node(tr);
		this.context.editor_state.apply(tr);
	}
}
