import { describe, it, expect } from 'vitest';
import { render } from './render.js';
import SveditTestWithKeymap from './testing_components/SveditTestWithKeymap.js';
import { KeyMapper } from '@svedit/core';
import { settle, make_story_session } from './test_utils.js';

/**
 * focusin/focusout bubble from descendants. The canvas must only count as
 * focused when the canvas element itself has focus, which is why Svedit
 * attaches native (non-bubbling) focus/blur listeners, like the Svelte and
 * Vue editors: otherwise an input inside a node component re-pushes the
 * session keymap and Enter/Backspace typed into it run editor commands.
 */
describe('canvas focus', () => {
	it('does not push the session keymap when a descendant input is focused', async () => {
		const session = make_story_session(1);
		const key_mapper = new KeyMapper();
		const { container } = render(() => (
			<SveditTestWithKeymap session={session} key_mapper={key_mapper} />
		));
		await settle();
		const canvas = container.querySelector('.svedit-canvas') as HTMLElement;
		const input = document.createElement('input');
		canvas.appendChild(input);

		canvas.focus();
		await settle();
		// Focusing the canvas pushed the session keymap.
		expect(key_mapper.remove_scope(session.keymap)).toBe(true);
		key_mapper.push_scope(session.keymap);

		input.focus();
		await settle();
		expect(document.activeElement).toBe(input);
		// Leaving the canvas for the input removed the keymap, and the input's
		// focus event bubbling up to the canvas did not push it again.
		expect(key_mapper.remove_scope(session.keymap)).toBe(false);
	});

	it('removes the session keymap when the editor unmounts while focused', async () => {
		const session = make_story_session(1);
		const key_mapper = new KeyMapper();
		const { container, unmount } = render(() => (
			<SveditTestWithKeymap session={session} key_mapper={key_mapper} />
		));
		await settle();
		const canvas = container.querySelector('.svedit-canvas') as HTMLElement;
		canvas.focus();
		await settle();
		unmount();
		expect(key_mapper.remove_scope(session.keymap)).toBe(false);
	});
});
