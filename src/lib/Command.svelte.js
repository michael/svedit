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