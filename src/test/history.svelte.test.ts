import { describe, it, expect } from 'vitest';
import create_test_session from './create_test_session.js';
import { apply_ops } from '../lib/doc_utils.js';
import { set_button_content } from './op_engine_helpers.js';

describe('history spill', () => {
	it('spills the oldest entries when history_limit is exceeded', () => {
		const session = create_test_session();
		const spilled: unknown[] = [];
		session.history_limit = 2;
		session.on_history_spill = (entries) => spilled.push(...entries);

		set_button_content(session, 'One');
		set_button_content(session, 'Two');
		set_button_content(session, 'Three');

		expect(session.history.length).toBe(2);
		expect(spilled.length).toBe(1);
		expect((spilled[0] as { ops: any[] }).ops[0][2].content).toBe('One');

		// Undo depth is bounded by the retained window.
		session.undo();
		session.undo();
		expect(session.can_undo).toBe(false);
		expect(session.get<{ content: string }>(['button_1', 'content']).content).toBe('One');
	});

	it('isolates spill callback exceptions from apply()', () => {
		const session = create_test_session();
		session.history_limit = 1;
		session.on_history_spill = () => {
			throw new Error('spill boom');
		};

		expect(() => {
			set_button_content(session, 'One');
			set_button_content(session, 'Two');
		}).not.toThrow();

		expect(session.history.length).toBe(1);
		expect(session.get<{ content: string }>(['button_1', 'content']).content).toBe('Two');
	});

	it('replays spilled entries onto a snapshot to materialize old versions', () => {
		const session = create_test_session();
		const base = session.to_json();
		const spilled: { ops: any[] }[] = [];
		session.history_limit = 2;
		session.on_history_spill = (entries) => spilled.push(...entries);

		set_button_content(session, 'One');
		set_button_content(session, 'Two');
		set_button_content(session, 'Three');

		const at_version_1 = apply_ops(base, spilled[0].ops);
		expect(at_version_1.nodes.button_1.content.content).toBe('One');

		const all_ops = [...spilled, ...session.history].flatMap((entry) => entry.ops);
		const at_head = apply_ops(base, all_ops);
		expect(at_head.nodes.button_1.content.content).toBe('Three');

		// Replay never mutates the snapshot.
		expect(base.nodes.button_1.content.content).toBe('Get started');
	});
});

describe('history_for (node-scoped history)', () => {
	it('filters history entries by the node their ops address', () => {
		const session = create_test_session();

		set_button_content(session, 'One');
		session.apply(session.tr.splice(['story_1', 'title'], 0, 0, 'X'));

		const button_history = session.history_for('button_1');
		expect(button_history.length).toBe(1);
		expect(button_history[0].index).toBe(0);

		const story_history = session.history_for('story_1');
		expect(story_history.length).toBe(1);
		expect(story_history[0].index).toBe(1);

		expect(session.history_for(['button_1', 'story_1']).length).toBe(2);
		expect(session.history_for('list_1').length).toBe(0);
	});

	it('finds entries that created a node', () => {
		const session = create_test_session();

		const tr = session.tr;
		tr.create({
			id: 'paragraph_new',
			type: 'paragraph',
			content: { content: 'Hello', marks: [], annotations: [] }
		});
		session.apply(tr);

		const entries = session.history_for('paragraph_new');
		expect(entries.length).toBe(1);
		expect(entries[0].entry.ops[0][0]).toBe('create');
	});
});
