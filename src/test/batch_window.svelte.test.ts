import { describe, it, expect } from 'vitest';
import create_test_session from './create_test_session.js';

function set_title_caret(session: ReturnType<typeof create_test_session>, offset: number) {
	session.selection = {
		type: 'text',
		path: ['story_1', 'title'],
		anchor_offset: offset,
		focus_offset: offset
	};
}

function type_char(session: ReturnType<typeof create_test_session>, char: string) {
	const tr = session.tr;
	tr.insert_text(char);
	session.apply(tr, { batch: true });
}

describe('batch window after undo/redo', () => {
	it('does not crash when a batched apply follows an undo within the batch window', () => {
		const session = create_test_session();
		set_title_caret(session, 11);

		type_char(session, 'a');
		session.undo();
		type_char(session, 'b');

		expect(session.get<{ content: string }>(['story_1', 'title']).content).toBe('First storyb');
		expect(session.history.length).toBe(1);
	});

	it('starts a new entry when typing continues after a redo', () => {
		const session = create_test_session();
		set_title_caret(session, 11);

		type_char(session, 'a');
		session.undo();
		session.redo();
		type_char(session, 'b');

		// 'b' must not merge into the redone 'a' entry.
		expect(session.get<{ content: string }>(['story_1', 'title']).content).toBe('First storyab');
		expect(session.history.length).toBe(2);
	});
});
