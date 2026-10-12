import { describe, it, expect } from 'vitest';
import { Store, derived } from '../lib/reactive.js';
import create_test_session from './create_test_session.js';

/** A tiny keyed state object on a store, like the Session's fields. */
function create_state() {
	const store = new Store();
	const values: Record<string, number> = { a: 1, b: 1 };
	return {
		store,
		get(key: string) {
			store.track(key);
			return values[key];
		},
		set(key: string, value: number) {
			values[key] = value;
			store.notify(key);
		}
	};
}

describe('derived', () => {
	it('recomputes only when a key it read changed', () => {
		const state = create_state();
		let computations = 0;
		const double_a = derived(state.store, () => {
			computations += 1;
			return state.get('a') * 2;
		});
		expect(double_a()).toBe(2);
		state.set('b', 5); // not read by double_a
		expect(double_a()).toBe(2);
		expect(computations).toBe(1);
		state.set('a', 3);
		expect(double_a()).toBe(6);
		expect(computations).toBe(2);
	});

	it('keeps the same reference until a dependency changes', () => {
		const state = create_state();
		const pair = derived(state.store, () => [state.get('a')]);
		const first = pair();
		state.set('b', 2);
		expect(pair()).toBe(first);
		state.set('a', 2);
		expect(pair()).not.toBe(first);
	});

	it('passes dependencies of a nested derived value on to the outer one', () => {
		const state = create_state();
		let outer_computations = 0;
		const inner = derived(state.store, () => state.get('a') + 1);
		const outer = derived(state.store, () => {
			outer_computations += 1;
			return inner() * 10;
		});
		expect(outer()).toBe(20);
		state.set('b', 9);
		expect(outer()).toBe(20);
		expect(outer_computations).toBe(1);
		state.set('a', 2);
		expect(outer()).toBe(30);
		expect(outer_computations).toBe(2);
	});

	it('recomputes on every change when it read no tracked key', () => {
		const state = create_state();
		let untracked = 1;
		const read_untracked = derived(state.store, () => untracked);
		expect(read_untracked()).toBe(1);
		untracked = 2;
		state.set('b', 2); // any change invalidates a value without dependencies
		expect(read_untracked()).toBe(2);
	});

	it('accepts a session as its source', () => {
		const session = create_test_session();
		let computations = 0;
		const selection_type = derived(session, () => {
			computations += 1;
			return session.selection?.type ?? null;
		});
		expect(selection_type()).toBeNull();
		session.commands = {};
		expect(selection_type()).toBeNull();
		expect(computations).toBe(1);
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		expect(selection_type()).toBe('node');
		expect(computations).toBe(2);
	});
});

describe('Session derived getters', () => {
	it('keep their reference when an unrelated field changes', () => {
		// Previously every change recomputed every derived getter, handing out
		// new arrays that made React selectors re-render for nothing.
		const session = create_test_session();
		session.selection = {
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 0,
			focus_offset: 5
		};
		const marks = session.selected_marks;
		session.commands = {};
		session.last_batch_started = 123;
		expect(session.selected_marks).toBe(marks);
		session.selection = {
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 1,
			focus_offset: 5
		};
		expect(session.selected_marks).not.toBe(marks);
	});
});

describe('Session assignments', () => {
	it('assigning the current value again notifies no one', () => {
		const session = create_test_session();
		let notifications = 0;
		session.subscribe(() => (notifications += 1));
		const version = session.version;
		const { selection, doc, history_index } = session;
		session.selection = selection;
		session.doc = doc;
		session.history_index = history_index;
		expect(notifications).toBe(0);
		expect(session.version).toBe(version);
	});

	it('still validates a selection assigned again after the document changed', () => {
		const session = create_test_session();
		const selection = {
			type: 'text' as const,
			path: ['story_1', 'title'],
			anchor_offset: 11,
			focus_offset: 11
		};
		session.selection = selection;
		const tr = session.tr;
		tr.set(['story_1', 'title'], { content: 'Short', marks: [], annotations: [] });
		tr.set_selection({
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 0,
			focus_offset: 0
		});
		session.apply(tr);
		expect(() => (session.selection = selection)).toThrow();
	});
});
