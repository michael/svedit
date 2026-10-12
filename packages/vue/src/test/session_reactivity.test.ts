import { describe, it, expect } from 'vitest';
import { isReactive, nextTick, reactive, toRaw, watchEffect } from 'vue';
import { derived } from '@svedit/core';
import create_test_session from './create_test_session.js';

/**
 * The Session logic lives in the @svedit/core package; Svedit's Session installs a
 * Vue tracker so reads of session fields subscribe computeds and watchers
 * per field, like the former `shallowRef` class fields did.
 */
describe('session reactivity', () => {
	it('does not wake readers when the current value is assigned again', async () => {
		const session = create_test_session();
		let runs = 0;
		const stop = watchEffect(() => {
			session.selection;
			session.doc;
			runs += 1;
		});
		const { selection, doc } = session;
		session.selection = selection;
		session.doc = doc;
		await nextTick();
		expect(runs).toBe(1);
		stop();
	});

	it('updates derived(session, ...) values read inside an effect', async () => {
		// derived() over a session used to recompute per change but not track
		// in Vue, so a watcher reading a cached value never re-ran.
		const session = create_test_session();
		const selection_type = derived(session, () => session.selection?.type ?? null);
		selection_type(); // computed and cached outside any effect
		const seen: Array<string | null> = [];
		const stop = watchEffect(() => {
			seen.push(selection_type());
		});
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		await nextTick();
		expect(seen).toEqual([null, 'node']);
		stop();
	});
	it('unwraps a reactive() selection, keeping the raw object', () => {
		// Regression: apply() deep-cloned the selection with structuredClone,
		// which throws on Vue's reactive proxies.
		const session = create_test_session();
		const selection = reactive({
			type: 'text' as const,
			path: ['story_1', 'title'],
			anchor_offset: 0,
			focus_offset: 0
		});
		session.selection = selection;
		// toRaw unwraps the proxy and keeps the identity of the raw object.
		expect(isReactive(session.selection)).toBe(false);
		expect(session.selection).toBe(toRaw(selection));
		const tr = session.tr;
		tr.insert_text('X');
		expect(() => session.apply(tr)).not.toThrow();
		expect(session.selection).toEqual({
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 1,
			focus_offset: 1
		});
		// The transaction produced a new selection, so later changes to the
		// caller's state do not reach the session.
		selection.anchor_offset = 5;
		expect(session.selection.anchor_offset).toBe(1);
	});
	it('reruns effects for the fields a change touches', async () => {
		const session = create_test_session();
		let selection_runs = 0;
		let doc_runs = 0;
		let selected_node_runs = 0;
		let can_undo_runs = 0;
		const stops = [
			watchEffect(() => {
				session.selection;
				selection_runs += 1;
			}),
			watchEffect(() => {
				session.doc;
				doc_runs += 1;
			}),
			watchEffect(() => {
				session.selected_node;
				selected_node_runs += 1;
			}),
			watchEffect(() => {
				session.can_undo;
				can_undo_runs += 1;
			})
		];
		expect([selection_runs, doc_runs, selected_node_runs, can_undo_runs]).toEqual([1, 1, 1, 1]);

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		await nextTick();
		expect([selection_runs, doc_runs, selected_node_runs, can_undo_runs]).toEqual([2, 1, 2, 1]);

		// A transaction that leaves the selection unchanged wakes doc and history
		// readers, and selected_node (it reads the doc), but not selection readers.
		session.apply(
			session.tr.set(['page_1', 'body', 0, 'title'], { content: 'X', marks: [], annotations: [] })
		);
		await nextTick();
		expect([selection_runs, doc_runs, selected_node_runs, can_undo_runs]).toEqual([2, 2, 3, 2]);
		for (const stop of stops) stop();
	});

	it('does not subscribe an effect to the fields it only writes', async () => {
		const session = create_test_session();
		let runs = 0;
		const stop = watchEffect(() => {
			runs += 1;
			session.selection = null;
		});
		await nextTick();
		expect(runs).toBe(1);
		stop();
	});
});
