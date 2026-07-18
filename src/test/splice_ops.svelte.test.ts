import { describe, it, expect } from 'vitest';
import create_test_session from './create_test_session.js';
import { apply_op } from '../lib/doc_utils.js';
import type { Text } from '../lib/types.js';
import {
	title_path,
	set_caret,
	press_key,
	current_entry,
	create_annotated_session,
	annotate
} from './op_engine_helpers.js';

describe('splice op', () => {
	it('records a single small splice op for text insertion', () => {
		const session = create_test_session();
		set_caret(session, 5);

		const tr = session.tr;
		tr.insert_text('XY');
		session.apply(tr);

		expect(session.get<Text>(title_path).content).toBe('FirstXY story');
		expect(current_entry(session).ops).toEqual([['splice', ['story_1', 'title'], 5, 0, 'XY']]);
		expect(current_entry(session).inverse_ops).toEqual([
			['splice', ['story_1', 'title'], 5, 2, '']
		]);
	});

	it('replaces a range in one splice', () => {
		const session = create_test_session();
		session.apply(session.tr.splice(title_path, 0, 5, 'Last'));

		expect(session.get<Text>(title_path).content).toBe('Last story');
		session.undo();
		expect(session.get<Text>(title_path).content).toBe('First story');
	});

	it('validates splice bounds', () => {
		const session = create_test_session();
		expect(() => session.tr.splice(title_path, 0, 99, '')).toThrow('out of bounds');
		expect(() => session.tr.splice(['story_1', 'layout'], 0, 0, 'x')).toThrow('text property');
	});

	it('rejects splice ops on non-text values at the op application layer', () => {
		// Op streams may bypass Transaction (replay, ingest); the application
		// layer fails with a clear error instead of a deep TypeError.
		const session = create_test_session();
		expect(() => apply_op(session.doc, ['splice', ['story_1', 'layout'], 0, 0, 'x'])).toThrow(
			'annotated text'
		);
	});

	it('expands an annotation when typing inside it, with a lossless inverse', () => {
		const session = create_annotated_session();
		annotate(session, 0, 5);

		set_caret(session, 2);
		const tr = session.tr;
		tr.insert_text('ab');
		session.apply(tr);

		expect(session.get<Text>(title_path).content).toBe('Fiabrst story');
		expect(session.get<Text>(title_path).annotations[0].start_offset).toBe(0);
		expect(session.get<Text>(title_path).annotations[0].end_offset).toBe(7);
		// Lossless inverse: a plain splice without a prior-ranges payload
		expect(current_entry(session).inverse_ops[0].length).toBe(5);

		session.undo();
		expect(session.get<Text>(title_path).content).toBe('First story');
		expect(session.get<Text>(title_path).annotations[0].start_offset).toBe(0);
		expect(session.get<Text>(title_path).annotations[0].end_offset).toBe(5);
	});

	it('carries prior ranges on the inverse when a deletion truncates an annotation', () => {
		const session = create_annotated_session();
		annotate(session, 3, 8);

		session.selection = { type: 'text', path: title_path, anchor_offset: 1, focus_offset: 5 };
		session.apply(session.tr.delete_selection());

		expect(session.get<Text>(title_path).content).toBe('F story');
		expect(session.get<Text>(title_path).annotations[0].start_offset).toBe(1);
		expect(session.get<Text>(title_path).annotations[0].end_offset).toBe(4);
		// Lossy inverse: the 6th element restores the prior ranges verbatim
		expect(current_entry(session).inverse_ops[0].length).toBe(6);

		session.undo();
		expect(session.get<Text>(title_path).content).toBe('First story');
		expect(session.get<Text>(title_path).annotations[0].start_offset).toBe(3);
		expect(session.get<Text>(title_path).annotations[0].end_offset).toBe(8);
	});

	it('cascade-deletes a fully deleted annotation node and restores it on undo', () => {
		const session = create_annotated_session();
		const range = annotate(session, 6, 11);
		const annotation_node_id = range.node_id;

		session.selection = { type: 'text', path: title_path, anchor_offset: 5, focus_offset: 11 };
		session.apply(session.tr.delete_selection());

		expect(session.get<Text>(title_path).content).toBe('First');
		expect(session.get<Text>(title_path).annotations.length).toBe(0);
		expect(session.get(annotation_node_id)).toBeUndefined();
		expect(current_entry(session).ops).toContainEqual(['delete', annotation_node_id]);

		session.undo();
		expect(session.get<Text>(title_path).content).toBe('First story');
		expect(session.get(annotation_node_id)).toBeTruthy();
		expect(session.get<Text>(title_path).annotations[0].start_offset).toBe(6);
		expect(session.get<Text>(title_path).annotations[0].end_offset).toBe(11);
	});

	it('handles character offsets, not UTF-16 units', () => {
		const session = create_test_session();
		session.apply(session.tr.set(title_path, { content: '😀ab', marks: [], annotations: [] }));

		set_caret(session, 1);
		const tr = session.tr;
		tr.insert_text('X');
		session.apply(tr);

		expect(session.get<Text>(title_path).content).toBe('😀Xab');
	});
});

describe('splice coalescing in history batching', () => {
	it('coalesces consecutive typing into one op, undone in one step', () => {
		const session = create_test_session();
		set_caret(session, 11);

		press_key(session, 'a');
		press_key(session, 'b');
		press_key(session, 'c');

		expect(session.get<Text>(title_path).content).toBe('First storyabc');
		expect(session.history.length).toBe(1);
		expect(current_entry(session).ops).toEqual([['splice', ['story_1', 'title'], 11, 0, 'abc']]);
		expect(current_entry(session).inverse_ops).toEqual([
			['splice', ['story_1', 'title'], 11, 3, '']
		]);

		session.undo();
		expect(session.get<Text>(title_path).content).toBe('First story');
	});

	it('does not coalesce non-contiguous insertions', () => {
		const session = create_test_session();
		set_caret(session, 11);
		press_key(session, 'a');

		set_caret(session, 0);
		press_key(session, 'x');

		expect(session.get<Text>(title_path).content).toBe('xFirst storya');
		expect(session.history.length).toBe(1);
		expect(current_entry(session).ops.length).toBe(2);

		session.undo();
		expect(session.get<Text>(title_path).content).toBe('First story');
	});
});
