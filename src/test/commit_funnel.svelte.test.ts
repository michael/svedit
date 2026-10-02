import { describe, it, expect } from 'vitest';
import create_test_session from './create_test_session.js';
import type { ChangeEvent } from '../lib/Session.svelte.js';
import { set_button_content } from './op_engine_helpers.js';

describe('commit funnel + on_change', () => {
	it('notifies on transaction commits with the applied ops', () => {
		const session = create_test_session();
		const events: ChangeEvent[] = [];
		session.on_change((change) => events.push(change));

		set_button_content(session, 'Changed');

		expect(events.length).toBe(1);
		expect(events[0].origin).toBe('transaction');
		expect(events[0].ops).toEqual([
			['set', ['button_1', 'content'], { content: 'Changed', marks: [], annotations: [] }]
		]);
		expect(events[0].inverse_ops).toEqual([
			['set', ['button_1', 'content'], { content: 'Get started', marks: [], annotations: [] }]
		]);
	});

	it('fires after the document was swapped, so listeners observe the new state', () => {
		const session = create_test_session();
		let observed_content: string | null = null;
		session.on_change(() => {
			observed_content = session.get<{ content: string }>(['button_1', 'content']).content;
		});

		set_button_content(session, 'Changed');

		expect(observed_content).toBe('Changed');
	});

	it('does not notify for ops-less transactions', () => {
		const session = create_test_session();
		const events: ChangeEvent[] = [];
		session.on_change((change) => events.push(change));

		const tr = session.tr;
		tr.set_selection({
			type: 'text',
			path: ['page_1', 'body', 0, 'title'],
			anchor_offset: 0,
			focus_offset: 0
		});
		session.apply(tr);

		expect(events.length).toBe(0);
	});

	it('notifies on undo and redo with invertible op pairs', () => {
		const session = create_test_session();
		const events: ChangeEvent[] = [];
		set_button_content(session, 'Changed');
		session.on_change((change) => events.push(change));

		session.undo();
		expect(session.get<{ content: string }>(['button_1', 'content']).content).toBe('Get started');
		expect(events.length).toBe(1);
		expect(events[0].origin).toBe('undo');
		expect(events[0].ops).toEqual([
			['set', ['button_1', 'content'], { content: 'Get started', marks: [], annotations: [] }]
		]);
		expect(events[0].inverse_ops).toEqual([
			['set', ['button_1', 'content'], { content: 'Changed', marks: [], annotations: [] }]
		]);

		session.redo();
		expect(session.get<{ content: string }>(['button_1', 'content']).content).toBe('Changed');
		expect(events.length).toBe(2);
		expect(events[1].origin).toBe('redo');
		expect(events[1].ops).toEqual([
			['set', ['button_1', 'content'], { content: 'Changed', marks: [], annotations: [] }]
		]);
	});

	it('notifies once per apply, also when batching merges history entries', () => {
		const session = create_test_session();
		const events: ChangeEvent[] = [];
		session.on_change((change) => events.push(change));

		set_button_content(session, 'One', { batch: true });
		set_button_content(session, 'Two', { batch: true });

		expect(events.length).toBe(2);
		expect(session.history.length).toBe(1);
	});

	it('keeps delivered ops stable when later applies batch into the same history entry', () => {
		const session = create_test_session();
		const events: ChangeEvent[] = [];
		session.on_change((change) => events.push(change));

		set_button_content(session, 'One', { batch: true });
		const first_ops_count = events[0].ops.length;
		set_button_content(session, 'Two', { batch: true });

		// The first history entry was mutated by batching, but the delivered
		// change record must not grow retroactively.
		expect(events[0].ops.length).toBe(first_ops_count);
	});

	it('supports unsubscribing', () => {
		const session = create_test_session();
		const events: ChangeEvent[] = [];
		const unsubscribe = session.on_change((change) => events.push(change));

		set_button_content(session, 'One');
		unsubscribe();
		set_button_content(session, 'Two');

		expect(events.length).toBe(1);
	});

	it('isolates listener exceptions from commit bookkeeping', () => {
		const session = create_test_session();
		const seen: ChangeEvent[] = [];
		session.on_change(() => {
			throw new Error('listener boom');
		});
		session.on_change((change) => seen.push(change));

		expect(() => set_button_content(session, 'Changed')).not.toThrow();

		// The doc changed, later listeners still ran, and the history entry
		// was recorded despite the throwing listener.
		expect(session.get<{ content: string }>(['button_1', 'content']).content).toBe('Changed');
		expect(seen.length).toBe(1);
		expect(session.history.length).toBe(1);

		session.undo();
		expect(session.get<{ content: string }>(['button_1', 'content']).content).toBe('Get started');
	});
});
