/**
 * Coverage for the fine-grained reactivity that keeps edits in large
 * documents cheap:
 *
 * - KeyedState notifies only the readers of a changed key. A SvelteSet or
 *   SvelteMap makes a read of a missing key depend on every change.
 * - Session.get subscribes to the node id at a node array index (its
 *   slot), so inserting or deleting a node only re-evaluates the paths at
 *   and after the change.
 * - Session.selection_at depends on which node owns a path and on that
 *   node's selection, not on the node's content.
 */

import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { KeyedState } from '../lib/node_visibility.svelte.js';
import { make_paragraph_session } from './test_utils.js';

/**
 * Runs `read(key)` in one effect per key and counts the effect runs after
 * the initial one.
 */
function count_runs<K>(keys: K[], read: (key: K) => unknown) {
	const runs = keys.map(() => -1);
	const destroy = $effect.root(() => {
		keys.forEach((key, index) => {
			$effect(() => {
				read(key);
				runs[index] += 1;
			});
		});
	});
	flushSync();
	return {
		runs,
		destroy,
		reset: () => runs.fill(0)
	};
}

type ParagraphSession = ReturnType<typeof make_paragraph_session>;

function insert_paragraph(session: ParagraphSession, index: number, id: string) {
	const tr = session.tr;
	tr.create({ id, type: 'paragraph', content: { content: id, marks: [], annotations: [] } });
	tr.set_selection({
		type: 'node',
		path: ['page_1', 'body'],
		anchor_offset: index,
		focus_offset: index
	});
	tr.insert_nodes([id]);
	session.apply(tr);
}

function delete_paragraphs(session: ParagraphSession, start: number, end: number) {
	session.selection = {
		type: 'node',
		path: ['page_1', 'body'],
		anchor_offset: start,
		focus_offset: end
	};
	session.apply(session.tr.delete_selection());
}

function type_text(session: ParagraphSession, index: number, text: string) {
	session.selection = {
		type: 'text',
		path: ['page_1', 'body', index, 'content'],
		anchor_offset: 0,
		focus_offset: 0
	};
	session.apply(session.tr.insert_text(text));
}

describe('KeyedState', () => {
	it('notifies only the readers of a changed key', () => {
		const state = new KeyedState<string, boolean>();
		state.set('a', true);
		state.set('b', true);
		const { runs, destroy } = count_runs(['a', 'b'], (key) => state.has(key));

		state.set('a', false);
		flushSync();
		expect(runs).toEqual([1, 0]);

		// Setting the same value notifies nobody
		state.set('a', false);
		flushSync();
		expect(runs).toEqual([1, 0]);
		destroy();
	});

	it('notifies readers of a missing key once its value is set', async () => {
		const state = new KeyedState<string, boolean>();
		let value: boolean | undefined;
		const { runs, destroy } = count_runs(['c'], (key) => (value = state.has(key)));
		expect(value).toBe(false);

		state.set('c', true);
		// Readers of missing keys are notified once per microtask
		await Promise.resolve();
		flushSync();
		expect(runs).toEqual([1]);
		expect(value).toBe(true);
		destroy();
	});

	it('iterates the keys that hold a value', () => {
		const state = new KeyedState<number, boolean>();
		state.set(1, true);
		state.set(2, true);
		state.set(3, false);
		state.set(2, false);
		expect([...state]).toEqual([1]);
		expect(state.any()).toBe(true);
		state.clear();
		expect([...state]).toEqual([]);
		expect(state.any()).toBe(false);
	});
});

describe('Session node array slots', () => {
	const indexes = Array.from({ length: 11 }, (_, i) => i);

	it('re-evaluates only the paths at and after an inserted node', () => {
		const session = make_paragraph_session(10);
		// Index 10 is past the end of the array, so it depends on the whole array
		const { runs, destroy, reset } = count_runs(
			indexes,
			(i) => session.get(['page_1', 'body', i])?.id
		);
		reset();

		insert_paragraph(session, 5, 'p_new');
		flushSync();
		expect(runs).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
		expect(session.get(['page_1', 'body', 5]).id).toBe('p_new');
		expect(session.get(['page_1', 'body', 10]).id).toBe('p_9');
		destroy();
	});

	it('re-evaluates only the paths at and after deleted nodes', () => {
		const session = make_paragraph_session(10);
		const { runs, destroy, reset } = count_runs(
			indexes,
			(i) => session.get(['page_1', 'body', i])?.id
		);
		reset();

		delete_paragraphs(session, 3, 5);
		flushSync();
		// Past the end of the array, index 10 depends on the whole array
		expect(runs).toEqual([0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]);
		expect(session.get(['page_1', 'body', 3]).id).toBe('p_5');
		expect(session.get(['page_1', 'body', 8])).toBeUndefined();
		destroy();
	});

	it('re-evaluates text paths only for the edited node', () => {
		const session = make_paragraph_session(5);
		const { runs, destroy, reset } = count_runs(
			[0, 1, 2, 3, 4],
			(i) => session.get(['page_1', 'body', i, 'content']).content
		);
		reset();

		type_text(session, 2, 'x');
		flushSync();
		expect(runs).toEqual([0, 0, 1, 0, 0]);
		destroy();
	});

	it('follows undo and redo of structural changes', () => {
		const session = make_paragraph_session(4);
		let ids: string[] = [];
		const destroy = $effect.root(() => {
			$effect(() => {
				ids = [0, 1, 2, 3, 4].map((i) => session.get(['page_1', 'body', i])?.id);
			});
		});
		flushSync();

		insert_paragraph(session, 1, 'p_new');
		flushSync();
		expect(ids).toEqual(['p_0', 'p_new', 'p_1', 'p_2', 'p_3']);

		session.undo();
		flushSync();
		expect(ids).toEqual(['p_0', 'p_1', 'p_2', 'p_3', undefined]);

		session.redo();
		flushSync();
		expect(ids).toEqual(['p_0', 'p_new', 'p_1', 'p_2', 'p_3']);
		destroy();
	});
});

describe('Session.selection_at', () => {
	const text_path = (i: number) => ['page_1', 'body', i, 'content'];

	it('re-evaluates only for the nodes the selection enters, moves in or leaves', () => {
		const session = make_paragraph_session(5);
		const { runs, destroy, reset } = count_runs([0, 1, 2, 3, 4], (i) =>
			session.selection_at(text_path(i))
		);
		reset();

		session.selection = { type: 'text', path: text_path(1), anchor_offset: 2, focus_offset: 2 };
		flushSync();
		expect(runs).toEqual([0, 1, 0, 0, 0]);

		session.selection = { type: 'text', path: text_path(1), anchor_offset: 4, focus_offset: 4 };
		flushSync();
		expect(runs).toEqual([0, 2, 0, 0, 0]);

		session.selection = { type: 'text', path: text_path(3), anchor_offset: 0, focus_offset: 0 };
		flushSync();
		expect(runs).toEqual([0, 3, 0, 1, 0]);
		expect(session.selection_at(text_path(3))?.path).toEqual(text_path(3));
		expect(session.selection_at(text_path(1))).toBeNull();
		destroy();
	});

	it('does not re-evaluate when the content of the owning node changes', () => {
		const session = make_paragraph_session(5);
		session.selection = { type: 'text', path: text_path(3), anchor_offset: 0, focus_offset: 0 };
		const { runs, destroy, reset } = count_runs([4], (i) => session.selection_at(text_path(i)));
		reset();

		const tr = session.tr;
		tr.set(['p_4', 'content'], { content: 'Changed', marks: [], annotations: [] });
		session.apply(tr);
		flushSync();
		expect(runs).toEqual([0]);
		destroy();
	});
});
