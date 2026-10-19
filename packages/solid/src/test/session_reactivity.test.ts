import { describe, it, expect } from 'vitest';
import { createEffect, createMemo, createRoot } from 'solid-js';
import { derived } from '@svedit/core';
import create_test_session from './create_test_session.js';
import { tick } from './render.js';

/**
 * The Session logic lives in the @svedit/core package; Svedit's Session installs a
 * Solid tracker (one signal per session field), so reads of session fields
 * subscribe memos and effects per field.
 *
 * Every effect is created inside `createRoot`, so it has an owner and can be
 * disposed at the end of the test.
 */
describe('session reactivity', () => {
	it('does not wake readers when the current value is assigned again', async () => {
		const session = create_test_session();
		let runs = 0;
		const dispose = createRoot((dispose) => {
			createEffect(() => {
				session.selection;
				session.doc;
				runs += 1;
			});
			return dispose;
		});
		const { selection, doc } = session;
		session.selection = selection;
		session.doc = doc;
		await tick();
		expect(runs).toBe(1);
		dispose();
	});

	it('updates derived(session, ...) values read inside an effect', async () => {
		// derived() over a session used to recompute per change but not track
		// in Vue, so a watcher reading a cached value never re-ran.
		const session = create_test_session();
		const selection_type = derived(session, () => session.selection?.type ?? null);
		selection_type(); // computed and cached outside any effect
		const seen: Array<string | null> = [];
		const dispose = createRoot((dispose) => {
			createEffect(() => {
				seen.push(selection_type());
			});
			return dispose;
		});
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		await tick();
		expect(seen).toEqual([null, 'node']);
		dispose();
	});

	it('reruns effects for the fields a change touches', async () => {
		const session = create_test_session();
		let selection_runs = 0;
		let doc_runs = 0;
		let selected_node_runs = 0;
		let can_undo_runs = 0;
		const dispose = createRoot((dispose) => {
			createEffect(() => {
				session.selection;
				selection_runs += 1;
			});
			createEffect(() => {
				session.doc;
				doc_runs += 1;
			});
			createEffect(() => {
				session.selected_node;
				selected_node_runs += 1;
			});
			createEffect(() => {
				session.can_undo;
				can_undo_runs += 1;
			});
			return dispose;
		});
		expect([selection_runs, doc_runs, selected_node_runs, can_undo_runs]).toEqual([1, 1, 1, 1]);

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		await tick();
		expect([selection_runs, doc_runs, selected_node_runs, can_undo_runs]).toEqual([2, 1, 2, 1]);

		// A transaction that leaves the selection unchanged wakes doc and history
		// readers, and selected_node (it reads the doc), but not selection readers.
		session.apply(
			session.tr.set(['page_1', 'body', 0, 'title'], { content: 'X', marks: [], annotations: [] })
		);
		await tick();
		expect([selection_runs, doc_runs, selected_node_runs, can_undo_runs]).toEqual([2, 2, 3, 2]);
		dispose();
	});

	it('recomputes a createMemo over session fields only when the fields it read change', async () => {
		const session = create_test_session();
		let memo_runs = 0;
		const seen: Array<string | null> = [];
		const dispose = createRoot((dispose) => {
			const selection_type = createMemo(() => {
				memo_runs += 1;
				return session.selection?.type ?? null;
			});
			createEffect(() => {
				seen.push(selection_type());
			});
			return dispose;
		});
		expect(memo_runs).toBe(1);
		expect(seen).toEqual([null]);

		// A document-only change does not touch the selection field.
		session.apply(
			session.tr.set(['page_1', 'body', 0, 'title'], { content: 'X', marks: [], annotations: [] })
		);
		await tick();
		expect(memo_runs).toBe(1);
		expect(seen).toEqual([null]);

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		await tick();
		expect(memo_runs).toBe(2);
		expect(seen).toEqual([null, 'node']);
		dispose();
	});

	it('does not subscribe an effect to the fields it only writes', async () => {
		const session = create_test_session();
		let runs = 0;
		const dispose = createRoot((dispose) => {
			createEffect(() => {
				runs += 1;
				session.selection = null;
			});
			return dispose;
		});
		await tick();
		expect(runs).toBe(1);
		dispose();
	});

	it('does not loop when an effect assigns a new selection object', async () => {
		// Unlike the test above, every run writes a fresh object, so each write
		// really triggers the selection signal. The effect must still run once,
		// and later selection changes must not wake it.
		const session = create_test_session();
		let runs = 0;
		const dispose = createRoot((dispose) => {
			createEffect(() => {
				runs += 1;
				session.selection = {
					type: 'node',
					path: ['page_1', 'body'],
					anchor_offset: 0,
					focus_offset: 1
				};
			});
			return dispose;
		});
		await tick();
		expect(runs).toBe(1);
		expect(session.selection).toMatchObject({ type: 'node', anchor_offset: 0, focus_offset: 1 });

		session.selection = null;
		await tick();
		expect(runs).toBe(1);
		dispose();
	});
});

describe('proxies handed to the session', () => {
	it('keeps a plain value identical', () => {
		const session = create_test_session();
		const selection = {
			type: 'text' as const,
			path: ['story_1', 'title'],
			anchor_offset: 0,
			focus_offset: 0
		};
		session.selection = selection;
		expect(session.selection).toBe(selection);
	});
});
