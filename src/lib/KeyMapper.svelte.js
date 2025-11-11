const MODIFIER_KEYS = ['meta', 'ctrl', 'alt', 'shift'];
const MODIFIER_EVENT_KEYS = {
	meta: 'metaKey',
	ctrl: 'ctrlKey',
	alt: 'altKey',
	shift: 'shiftKey'
};

/**
 * Validates and defines a keymap.
 * Throws an error if any key combo is invalid.
 * Valid formats: 'meta+e,ctrl+e' or 'meta+shift+a'
 * Invalid: 'meta+e+a' (only one non-modifier key allowed)
 */
export function define_keymap(keymap) {
	for (const [key_combo] of Object.entries(keymap)) {
		const alternatives = key_combo.split(',');

		for (const alternative of alternatives) {
			const parts = alternative.trim().toLowerCase().split('+');
			const non_modifiers = parts.filter(part => !MODIFIER_KEYS.includes(part));

			if (non_modifiers.length !== 1) {
				throw new Error(
					`Invalid key combo: "${alternative}". Must have exactly one non-modifier key. Found: ${non_modifiers.length}`
				);
			}

			if (non_modifiers[0].length !== 1) {
				throw new Error(
					`Invalid key combo: "${alternative}". Non-modifier key must be a single character. Got: "${non_modifiers[0]}"`
				);
			}
		}
	}
	return keymap;
}

/**
 * Matches a keyboard event against a key combo string.
 * Example: 'meta+e,ctrl+e' matches either (metaKey && key==='e') OR (ctrlKey && key==='e')
 */
function matches_key_combo(key_combo, event) {
	const alternatives = key_combo.split(',');

	return alternatives.some(alternative => {
		const parts = alternative.trim().toLowerCase().split('+');
		const modifiers = parts.filter(part => MODIFIER_KEYS.includes(part));
		const non_modifier = parts.find(part => !MODIFIER_KEYS.includes(part));

		// Check if all specified modifiers are pressed
		const modifiers_match = modifiers.every(mod => event[MODIFIER_EVENT_KEYS[mod]]);

		// Check if no unspecified modifiers are pressed
		const no_extra_modifiers = MODIFIER_KEYS.every(mod => {
			if (modifiers.includes(mod)) return true; // This modifier is expected
			return !event[MODIFIER_EVENT_KEYS[mod]]; // This modifier should NOT be pressed
		});

		// Check if the key matches
		const key_matches = event.key.toLowerCase() === non_modifier;
		return modifiers_match && no_extra_modifiers && key_matches;
	});
}

/**
 * Handles a key map by matching keyboard event against registered key combos
 * and executing the first enabled command.
 */
function handle_key_map(key_map, event) {
	for (const [key_combo, commands] of Object.entries(key_map)) {
		if (matches_key_combo(key_combo, event)) {
			// Find the first enabled command and execute it
			const enabled_command = commands.find(cmd => cmd.is_enabled());
			if (enabled_command) {
				event.preventDefault();
				enabled_command.execute();
				return true;
			}
		}
	}
	return false;
}

/**
 * KeyMapper manages keyboard shortcuts using a stack-based scope system.
 * 
 * Scopes are tried from top to bottom (most specific to most general).
 * This makes it completely general-purpose - no knowledge of specific contexts.
 * 
 * Usage:
 *   const mapper = new KeyMapper();
 *   mapper.push_scope(app_keymap);        // Base layer
 *   mapper.push_scope(editor_keymap);     // When editor gains focus
 *   mapper.pop_scope();                   // When editor loses focus
 */
export class KeyMapper {
	constructor() {
		this.scope_stack = [];
	}

	/**
	 * Push a new scope onto the stack (becomes highest priority)
	 */
	push_scope(keymap) {
		this.scope_stack.push(keymap);
	}

	/**
	 * Pop the most recent scope from the stack
	 */
	pop_scope() {
		return this.scope_stack.pop();
	}

	/**
	 * Handle keyboard event by trying scopes from top to bottom
	 */
	handle_keydown(event) {
		// Try from most specific (top of stack) to most general (bottom)
		for (let i = this.scope_stack.length - 1; i >= 0; i--) {
			if (handle_key_map(this.scope_stack[i], event)) {
				return;
			}
		}
	}
}