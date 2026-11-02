import { is_virtual_keyboard_active } from './utils.js';

const MODIFIERS = ['meta', 'ctrl', 'alt', 'shift'] as const;
type Modifier = (typeof MODIFIERS)[number];
const is_modifier = (part: string): part is Modifier =>
	(MODIFIERS as readonly string[]).includes(part);

/** A command as required by the key mapper: anything with is_enabled/execute. */
type KeymapCommand = { is_enabled: () => boolean; execute: () => unknown };

/** A keymap maps key combo strings to arrays of commands. */
export type Keymap = Record<string, KeymapCommand[]>;

/** Split an alternative like 'meta+shift+a' into its non-modifier keys and modifiers. */
function parse_combo(alternative: string): { keys: string[]; modifiers: Modifier[] } {
	const parts = alternative.trim().toLowerCase().split('+');
	return { keys: parts.filter((part) => !is_modifier(part)), modifiers: parts.filter(is_modifier) };
}

/**
 * Validates and defines a keymap.
 * Valid formats: 'meta+e,ctrl+e' or 'meta+shift+a'
 * Invalid: 'meta+e+a' (only one non-modifier key allowed)
 *
 * @throws {Error} If any key combo is invalid
 */
export function define_keymap<K extends Keymap>(keymap: K): K {
	for (const alternative of Object.keys(keymap).flatMap((key_combo) => key_combo.split(','))) {
		const { keys } = parse_combo(alternative);
		if (keys.length !== 1) {
			throw new Error(
				`Invalid key combo: "${alternative}". Must have exactly one non-modifier key. Found: ${keys.length}`
			);
		}
	}
	return keymap;
}

/**
 * Whether a keyboard event matches a combo. On virtual keyboards (iOS,
 * Android) modifiers must be assumed accidental (e.g. shift from
 * auto-capitalization), so combos with modifiers never match and extra
 * modifiers are ignored.
 */
function matches(alternative: string, event: KeyboardEvent, virtual_keyboard: boolean): boolean {
	const { keys, modifiers } = parse_combo(alternative);
	if (event.key.toLowerCase() !== keys[0]) return false;
	if (virtual_keyboard) return modifiers.length === 0;
	return MODIFIERS.every((modifier) => event[`${modifier}Key`] === modifiers.includes(modifier));
}

/** Execute the first enabled command bound to the event. Async errors are logged. */
function handle_keymap(keymap: Keymap, event: KeyboardEvent, virtual_keyboard: boolean): boolean {
	for (const [key_combo, commands] of Object.entries(keymap)) {
		const alternatives = key_combo.split(',');
		if (!alternatives.some((alternative) => matches(alternative, event, virtual_keyboard)))
			continue;
		const command = commands.find((command) => command.is_enabled());
		if (!command) continue;
		event.preventDefault();
		const result = command.execute();
		if (result instanceof Promise) {
			result.catch((error) => console.error('Command execution failed:', error));
		}
		return true;
	}
	return false;
}

/**
 * KeyMapper manages keyboard shortcuts with a stack of scopes, tried from
 * the most specific (top) to the most general (bottom).
 *
 * Usage:
 *   const mapper = new KeyMapper();
 *   mapper.push_scope(app_keymap);        // Base layer
 *   mapper.push_scope(editor_keymap);     // When editor gains focus
 *   mapper.pop_scope();                   // When editor loses focus
 */
export class KeyMapper {
	scope_stack: Keymap[] = [];
	/** Temporarily disables key handling (e.g. during character composition). */
	skip_onkeydown = false;

	/** Push a new scope onto the stack (becomes highest priority) */
	push_scope(keymap: Keymap): void {
		this.scope_stack.push(keymap);
	}

	/** Pop the most recent scope from the stack */
	pop_scope(): Keymap | undefined {
		return this.scope_stack.pop();
	}

	/** Handle keyboard event by trying scopes from top to bottom */
	handle_keydown(event: KeyboardEvent): void {
		if (this.skip_onkeydown) return;
		const virtual_keyboard = is_virtual_keyboard_active();
		for (let index = this.scope_stack.length - 1; index >= 0; index--) {
			if (handle_keymap(this.scope_stack[index], event, virtual_keyboard)) return;
		}
	}
}
