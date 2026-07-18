import { describe, it, expect } from 'vitest';
import create_test_session from './create_test_session.js';
import type { ChangeEvent } from '../lib/Session.svelte.js';
import type { Text } from '../lib/types.js';
import { title_path, text_value } from './op_engine_helpers.js';

describe('ingest', () => {
	it('applies external ops and notifies on_change without touching history', () => {
		const session = create_test_session();
		const events: ChangeEvent[] = [];
		session.on_change((change) => events.push(change));

		session.ingest([['set', ['button_1', 'content'], text_value('External')]]);

		expect(session.get<Text>(['button_1', 'content']).content).toBe('External');
		expect(events.length).toBe(1);
		expect(events[0].origin).toBe('external');
		expect(events[0].inverse_ops).toEqual([]);
		expect(session.history.length).toBe(0);
		expect(session.can_undo).toBe(false);
	});

	it('reports a custom origin', () => {
		const session = create_test_session();
		const events: ChangeEvent[] = [];
		session.on_change((change) => events.push(change));

		session.ingest([['set', ['button_1', 'content'], text_value('Restored')]], {
			origin: 'restore'
		});

		expect(events[0].origin).toBe('restore');
	});

	it('keeps foreign ops out of local undo', () => {
		const session = create_test_session();

		const tr = session.tr;
		tr.set(['button_1', 'href'], 'https://local.example');
		session.apply(tr);

		session.ingest([['set', ['button_1', 'content'], text_value('Foreign')]]);

		session.undo();

		// The local edit is reverted, the foreign one persists.
		expect(session.get<string>(['button_1', 'href'])).toBe('https://github.com/michael/svedit');
		expect(session.get<Text>(['button_1', 'content']).content).toBe('Foreign');
	});

	it('closes the history batch window, so later typing starts a new entry', () => {
		const session = create_test_session();
		session.selection = { type: 'text', path: title_path, anchor_offset: 11, focus_offset: 11 };

		let tr = session.tr;
		tr.insert_text('a');
		session.apply(tr, { batch: true });

		session.ingest([['splice', ['story_1', 'title'], 0, 0, 'Z']]);

		tr = session.tr;
		tr.insert_text('b');
		session.apply(tr, { batch: true });

		// Without the window reset, 'b' would batch into the pre-ingest entry
		// and a single undo would straddle the foreign change.
		expect(session.history.length).toBe(2);
	});

	it('rejects invalid results and leaves the session untouched', () => {
		const session = create_test_session();

		expect(() =>
			session.ingest([
				['set', ['story_1', 'buttons'], { nodes: ['no_such_node'], marks: [], annotations: [] }]
			])
		).toThrow();

		expect(session.get<{ nodes: string[] }>(['story_1', 'buttons']).nodes).toEqual(['button_1']);
	});

	it('rejects unknown op types before applying anything', () => {
		const session = create_test_session();

		expect(() =>
			session.ingest([
				['set', ['button_1', 'content'], text_value('Half')],
				['teleport', 'button_1']
			])
		).toThrow('unknown type');

		expect(session.get<Text>(['button_1', 'content']).content).toBe('Get started');
	});

	it('shifts a text caret across a foreign splice before it', () => {
		const session = create_test_session();
		session.selection = { type: 'text', path: title_path, anchor_offset: 5, focus_offset: 5 };

		session.ingest([['splice', ['story_1', 'title'], 0, 0, 'AB']]);

		expect(session.get<Text>(title_path).content).toBe('ABFirst story');
		expect(session.selection?.anchor_offset).toBe(7);
		expect(session.selection?.focus_offset).toBe(7);
	});

	it('leaves a text caret alone when the foreign splice is after it', () => {
		const session = create_test_session();
		session.selection = { type: 'text', path: title_path, anchor_offset: 2, focus_offset: 2 };

		session.ingest([['splice', ['story_1', 'title'], 5, 0, 'XY']]);

		expect(session.selection?.anchor_offset).toBe(2);
	});

	it('collapses a caret inside a foreign deletion to its start', () => {
		const session = create_test_session();
		session.selection = { type: 'text', path: title_path, anchor_offset: 4, focus_offset: 4 };

		session.ingest([['splice', ['story_1', 'title'], 2, 5, '']]);

		expect(session.get<Text>(title_path).content).toBe('Fitory');
		expect(session.selection?.anchor_offset).toBe(2);
	});

	it('clears the selection when its node is deleted', () => {
		const session = create_test_session();
		session.selection = {
			type: 'text',
			path: ['list_1', 'list_items', 0, 'content'],
			anchor_offset: 3,
			focus_offset: 3
		};

		session.ingest([
			['set', ['list_1', 'list_items'], { nodes: ['list_item_2'], marks: [], annotations: [] }],
			['delete', 'list_item_1']
		]);

		expect(session.selection).toBeNull();
	});

	it('clamps offsets after a whole-value set shrank the content', () => {
		const session = create_test_session();
		session.selection = { type: 'text', path: title_path, anchor_offset: 11, focus_offset: 11 };

		session.ingest([['set', ['story_1', 'title'], text_value('Hi')]]);

		expect(session.selection?.anchor_offset).toBe(2);
		expect(session.selection?.focus_offset).toBe(2);
	});
});
