import { is_virtual_keyboard_active } from './utils.js';

const MODIFIER_KEYS: readonly string[] = ['meta', 'ctrl', 'alt', 'shift'];
const MODIFIER_EVENT_KEYS: Record<string, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'> = {
	meta: 'metaKey',
	ctrl: 'ctrlKey',
	alt: 'altKey',
	shift: 'shiftKey'
};

/**
 * A command as required by the key mapper: anything with is_enabled/execute.
 */
type KeymapCommand = { is_enabled: () => boolean; execute: () => any };

/**
 * A keymap maps key combo strings to arrays of commands.
 */
export type Keymap = Record<string, KeymapCommand[]>;

/**
 * Validates and defines a keymap.
 * Throws an error if any key combo is invalid.
 * Valid formats: 'meta+e,ctrl+e' or 'meta+shift+a'
 * Invalid: 'meta+e+a' (only one non-modifier key allowed)
 */
export function define_keymap<K extends Keymap>(keymap: K): K {
	for (const [key_combo] of Object.entries(keymap)) {
		const alternatives = key_combo.split(',');

		for (const alternative of alternatives) {
			const parts = alternative.trim().toLowerCase().split('+');
			const non_modifiers = parts.filter((part) => !MODIFIER_KEYS.includes(part));

			if (non_modifiers.length !== 1) {
				throw new Error(
					`Invalid key combo: "${alternative}". Must have exactly one non-modifier key. Found: ${non_modifiers.length}`
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
function matches_key_combo(
	key_combo: string,
	event: KeyboardEvent,
	virtual_keyboard_active = false
): boolean {
	const alternatives = key_combo.split(',');

	return alternatives.some((alternative) => {
		const parts = alternative.trim().toLowerCase().split('+');
		const modifiers = parts.filter((part) => MODIFIER_KEYS.includes(part));
		const non_modifier = parts.find((part) => !MODIFIER_KEYS.includes(part));

		if (virtual_keyboard_active && modifiers.length > 0) {
			return false;
		}

		// Check if all specified modifiers are pressed
		const modifiers_match = modifiers.every((mod) => event[MODIFIER_EVENT_KEYS[mod]]);

		// Check if no unspecified modifiers are pressed
		// NOTE: On virtual keyboards (iOS / Anroid) modifier keys are just ignored, because
		// they must be assumed accidental (e.g. Shift activated as a result of auto-capitalization)
		const no_extra_modifiers = virtual_keyboard_active
			? true
			: MODIFIER_KEYS.every((mod) => {
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
 *
 * Supports both sync and async commands. For async commands, errors are logged
 * but don't crash the application.
 */
function handle_key_map(key_map: Keymap, event: KeyboardEvent): boolean {
	const virtual_keyboard_active = is_virtual_keyboard_active();

	for (const [key_combo, commands] of Object.entries(key_map)) {
		if (matches_key_combo(key_combo, event, virtual_keyboard_active)) {
			// Find the first enabled command and execute it
			const enabled_command = commands.find((cmd) => cmd.is_enabled());
			if (enabled_command) {
				event.preventDefault();

				// Execute command (may be sync or async)
				const result = enabled_command.execute();

				// If it's a promise, handle errors (fire-and-forget)
				if (result instanceof Promise) {
					result.catch((err) => {
						console.error('Command execution failed:', err);
					});
				}

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
	scope_stack: Keymap[];
	skip_onkeydown: boolean;

	constructor() {
		this.scope_stack = [];
		this.skip_onkeydown = false;
	}

	/**
	 * Push a new scope onto the stack (becomes highest priority)
	 */
	push_scope(keymap: Keymap): void {
		// console.log('pushed keymap', keymap);
		this.scope_stack.push(keymap);
	}

	/**
	 * Pop the most recent scope from the stack
	 */
	pop_scope(): Keymap | undefined {
		const keymap = this.scope_stack.pop();
		// console.log('popped keymap', keymap);
		return keymap;
	}

	/**
	 * Handle keyboard event by trying scopes from top to bottom
	 */
	handle_keydown(event: KeyboardEvent): void {
		// Key handling temporarily disabled (e.g. while character composition takes place)
		if (this.skip_onkeydown) return;
		// console.log('KeyMapper.handle_keydown', event);
		// Try from most specific (top of stack) to most general (bottom)
		for (let i = this.scope_stack.length - 1; i >= 0; i--) {
			if (handle_key_map(this.scope_stack[i], event)) {
				return;
			}
		}
	}
}
