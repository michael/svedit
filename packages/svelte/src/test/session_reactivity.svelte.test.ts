import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { derived } from '@svedit/core';
import create_test_session from './create_test_session.js';

/**
 * The Session logic lives in the @svedit/core package; Svedit's Session installs a
 * Svelte tracker so reads of session fields subscribe effects and deriveds
 * per field, like the former `$state.raw` class fields did.
 */
describe('session reactivity', () => {
	it('does not wake readers when the current value is assigned again', () => {
		const session = create_test_session();
		let runs = 0;
		const stop = $effect.root(() => {
			$effect(() => {
				session.selection;
				session.doc;
				runs += 1;
			});
		});
		flushSync();
		const { selection, doc } = session;
		session.selection = selection;
		session.doc = doc;
		flushSync();
		expect(runs).toBe(1);
		stop();
	});

	it('updates derived(session, ...) values read inside an effect', () => {
		// derived() over a session used to recompute per change but not track
		// in Svelte, so an effect reading a cached value never re-ran.
		const session = create_test_session();
		const selection_type = derived(session, () => session.selection?.type ?? null);
		selection_type(); // computed and cached outside any effect
		const seen: Array<string | null> = [];
		const stop = $effect.root(() => {
			$effect(() => {
				seen.push(selection_type());
			});
		});
		flushSync();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		flushSync();
		expect(seen).toEqual([null, 'node']);
		stop();
	});
	it('applies a transaction after a $state selection was assigned', () => {
		// Regression: apply() deep-cloned the selection with structuredClone,
		// which throws on Svelte's state proxies.
		const session = create_test_session();
		const selection = $state({
			type: 'text' as const,
			path: ['story_1', 'title'],
			anchor_offset: 0,
			focus_offset: 0
		});
		session.selection = selection;
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
	it('reruns effects for the fields a change touches', () => {
		const session = create_test_session();
		let selection_runs = 0;
		let doc_runs = 0;
		let selected_node_runs = 0;
		let can_undo_runs = 0;
		const stop = $effect.root(() => {
			$effect(() => {
				session.selection;
				selection_runs += 1;
			});
			$effect(() => {
				session.doc;
				doc_runs += 1;
			});
			$effect(() => {
				session.selected_node;
				selected_node_runs += 1;
			});
			$effect(() => {
				session.can_undo;
				can_undo_runs += 1;
			});
		});
		flushSync();
		expect([selection_runs, doc_runs, selected_node_runs, can_undo_runs]).toEqual([1, 1, 1, 1]);

		// A selection change wakes selection readers and derived values that
		// depend on the selection, but not doc or history readers.
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		flushSync();
		expect([selection_runs, doc_runs, selected_node_runs, can_undo_runs]).toEqual([2, 1, 2, 1]);

		// A transaction that leaves the selection unchanged wakes doc and history
		// readers, and selected_node (it reads the doc), but not selection readers.
		session.apply(
			session.tr.set(['page_1', 'body', 0, 'title'], { content: 'X', marks: [], annotations: [] })
		);
		flushSync();
		expect([selection_runs, doc_runs, selected_node_runs, can_undo_runs]).toEqual([2, 2, 3, 2]);
		stop();
	});

	it('does not subscribe an effect to the fields it only writes', () => {
		const session = create_test_session();
		let runs = 0;
		const stop = $effect.root(() => {
			$effect(() => {
				runs += 1;
				// Writing without reading must not re-trigger this effect.
				session.selection = null;
			});
		});
		flushSync();
		expect(runs).toBe(1);
		stop();
	});
});
