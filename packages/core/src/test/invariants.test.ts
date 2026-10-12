import { describe, it, expect } from 'vitest';
import create_test_session from './create_test_session.js';
import type { Selection } from '../lib/types.js';

/**
 * The correctness properties the framework bindings (and application code)
 * rely on. They are listed in packages/core/CLAUDE.md; each test here pins
 * one of them so a change to Session or Transaction that breaks a property
 * fails here first, independent of any framework.
 */

function title_caret(offset: number): Selection {
	return {
		type: 'text',
		path: ['story_1', 'title'],
		anchor_offset: offset,
		focus_offset: offset
	};
}

function text(content: string) {
	return { content, marks: [], annotations: [] };
}

describe('values are immutable and copied on write', () => {
	it('replaces the document and the changed node, keeps every other node', () => {
		const session = create_test_session();
		const doc_before = session.doc;
		const story_before = session.get('story_1');
		const list_before = session.get('list_1');
		const page_before = session.get('page_1');
		const buttons_before = session.get(['story_1', 'buttons']);

		const tr = session.tr;
		tr.set(['story_1', 'title'], text('Changed'));
		session.apply(tr);

		expect(session.doc).not.toBe(doc_before);
		expect(session.get('story_1')).not.toBe(story_before);
		expect(session.get('list_1')).toBe(list_before);
		expect(session.get('page_1')).toBe(page_before);
		// Untouched values inside the changed node keep their identity too.
		expect(session.get(['story_1', 'buttons'])).toBe(buttons_before);
		// The previous document is left as it was.
		expect(doc_before.nodes.story_1).toBe(story_before);
		expect(story_before.title.content).toBe('First story');
	});

	it('leaves the session untouched while a transaction is in flight', () => {
		const session = create_test_session();
		const doc_before = session.doc;
		const version_before = session.version;

		const tr = session.tr;
		tr.set(['story_1', 'title'], text('Draft'));

		expect(tr.doc).not.toBe(doc_before);
		expect(tr.get(['story_1', 'title']).content).toBe('Draft');
		expect(session.doc).toBe(doc_before);
		expect(session.get(['story_1', 'title']).content).toBe('First story');
		expect(session.version).toBe(version_before);
	});

	it('keeps untouched nodes across undo and redo', () => {
		const session = create_test_session();
		const list_before = session.get('list_1');
		const tr = session.tr;
		tr.set(['story_1', 'title'], text('Changed'));
		session.apply(tr);
		session.undo();
		expect(session.get('list_1')).toBe(list_before);
		expect(session.get(['story_1', 'title']).content).toBe('First story');
		session.redo();
		expect(session.get('list_1')).toBe(list_before);
		expect(session.get(['story_1', 'title']).content).toBe('Changed');
	});
});

describe('the session never aliases caller-owned objects', () => {
	it('copies a set value, so mutating it later changes neither doc nor redo', () => {
		const session = create_test_session();
		const value = text('Owned by caller');
		const tr = session.tr;
		tr.set(['story_1', 'title'], value);
		session.apply(tr);
		expect(session.get(['story_1', 'title'])).not.toBe(value);

		value.content = 'Mutated after apply';
		expect(session.get(['story_1', 'title']).content).toBe('Owned by caller');
		session.undo();
		session.redo();
		expect(session.get(['story_1', 'title']).content).toBe('Owned by caller');
	});

	it('copies a created node, including nested values', () => {
		const session = create_test_session();
		const content = text('Created');
		const node = { id: 'paragraph_1', type: 'paragraph', content };
		const tr = session.tr;
		tr.create(node);
		session.apply(tr);
		expect(session.get('paragraph_1')).not.toBe(node);
		expect(session.get(['paragraph_1', 'content'])).not.toBe(content);

		content.content = 'Mutated after apply';
		expect(session.get(['paragraph_1', 'content']).content).toBe('Created');
		session.undo();
		session.redo();
		expect(session.get(['paragraph_1', 'content']).content).toBe('Created');
	});
});

describe('a transaction applies only to the document it was created from', () => {
	it('rejects a transaction with ops created before another apply', () => {
		const session = create_test_session();
		const first = session.tr;
		const second = session.tr;
		first.set(['story_1', 'title'], text('First'));
		second.set(['story_1', 'description'], text('Second'));
		session.apply(first);

		expect(() => session.apply(second)).toThrow('stale');
		// The first change survived.
		expect(session.get(['story_1', 'title']).content).toBe('First');
		expect(session.get(['story_1', 'description']).content).toBe('First story description.');
		expect(session.history.length).toBe(1);
	});

	it('rejects a transaction created before an undo', () => {
		const session = create_test_session();
		const tr = session.tr;
		tr.set(['story_1', 'title'], text('First'));
		session.apply(tr);
		const stale = session.tr;
		stale.set(['story_1', 'title'], text('Stale'));
		session.undo();
		expect(() => session.apply(stale)).toThrow('stale');
		expect(session.get(['story_1', 'title']).content).toBe('First story');
	});

	it('still applies a selection-only transaction created before another apply', () => {
		const session = create_test_session();
		const select = session.tr;
		select.set_selection(title_caret(2));
		const edit = session.tr;
		edit.set(['story_1', 'description'], text('Edited'));
		session.apply(edit);
		session.apply(select);
		expect(session.selection).toEqual(title_caret(2));
	});

	it('rejects applying the same transaction twice', () => {
		const session = create_test_session();
		const tr = session.tr;
		tr.set(['story_1', 'title'], text('Once'));
		session.apply(tr);
		expect(() => session.apply(tr)).toThrow('stale');
		expect(session.history.length).toBe(1);
	});
});

describe('apply validates before it swaps state', () => {
	it('leaves doc, selection, history and version untouched when the result is invalid', () => {
		const session = create_test_session();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 2,
			focus_offset: 3
		};
		const doc_before = session.doc;
		const selection_before = session.selection;
		const history_before = session.history;
		const version_before = session.version;
		let notifications = 0;
		session.subscribe(() => (notifications += 1));

		const tr = session.tr;
		tr.set(['page_1', 'body'], { nodes: [], marks: [], annotations: [] });
		expect(() => session.apply(tr)).toThrow('out of bounds');

		expect(session.doc).toBe(doc_before);
		expect(session.selection).toBe(selection_before);
		expect(session.history).toBe(history_before);
		expect(session.version).toBe(version_before);
		expect(notifications).toBe(0);
	});
});

describe('notifications', () => {
	it('wakes subscribers once per apply, undo and redo', () => {
		const session = create_test_session();
		session.selection = title_caret(0);
		let notifications = 0;
		session.subscribe(() => (notifications += 1));

		const tr = session.tr;
		tr.insert_text('X'); // changes doc, selection, history, history_index
		session.apply(tr);
		expect(notifications).toBe(1);
		session.undo();
		expect(notifications).toBe(2);
		session.redo();
		expect(notifications).toBe(3);
	});

	it('wakes no one for an apply that changes nothing', () => {
		const session = create_test_session();
		session.selection = title_caret(0);
		const version_before = session.version;
		let notifications = 0;
		session.subscribe(() => (notifications += 1));

		session.apply(session.tr); // no ops, same selection object
		expect(notifications).toBe(0);
		expect(session.version).toBe(version_before);
		expect(session.history.length).toBe(0);
	});

	it('keeps the doc object for a transaction without ops', () => {
		const session = create_test_session();
		const doc_before = session.doc;
		const tr = session.tr;
		tr.set_selection(title_caret(3));
		session.apply(tr);
		expect(session.doc).toBe(doc_before);
		expect(session.selection).toEqual(title_caret(3));
	});
});

describe('state transitions read untracked', () => {
	// A binding's effect that applies a transaction, undoes, or assigns the
	// selection must not become a subscriber of the fields the session reads
	// while doing so. store.collect() records every tracked read, like a
	// framework effect would.
	it('tracks nothing while assigning a selection', () => {
		const session = create_test_session();
		const { keys } = session.store.collect(() => {
			session.selection = title_caret(1);
		});
		expect([...keys]).toEqual([]);
	});

	it('tracks nothing while applying, undoing and redoing', () => {
		const session = create_test_session();
		session.selection = title_caret(0);
		const tr = session.tr; // reading session.tr does track, so build it outside
		tr.insert_text('X');
		const { keys } = session.store.collect(() => {
			session.apply(tr);
			session.undo();
			session.redo();
		});
		expect([...keys]).toEqual([]);
	});

	it('tracks the fields a public getter reads', () => {
		const session = create_test_session();
		const { keys } = session.store.collect(() => session.can_undo);
		expect([...keys]).toEqual(['history_index']);
	});
});

describe('history entries are immutable', () => {
	it('replaces the history array instead of pushing into it', () => {
		const session = create_test_session();
		const history_before = session.history;
		const tr = session.tr;
		tr.set(['story_1', 'title'], text('Changed'));
		session.apply(tr);
		expect(session.history).not.toBe(history_before);
		expect(history_before.length).toBe(0);
		expect(session.history.length).toBe(1);
	});

	it('merges a batched apply into a new entry object', () => {
		const session = create_test_session();
		session.selection = title_caret(0);
		const first = session.tr;
		first.insert_text('a');
		session.apply(first, { batch: true });
		const entry_before = session.history[0];
		const second = session.tr;
		second.insert_text('b');
		session.apply(second, { batch: true });
		expect(session.history.length).toBe(1);
		expect(session.history[0]).not.toBe(entry_before);
		expect(entry_before.ops).toBe(first.ops);
		expect(first.ops.length).toBe(1);
	});
});
