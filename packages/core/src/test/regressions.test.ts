import { describe, it, expect } from 'vitest';
import Session from '../lib/Session.js';
import { count_references, get_referencing_node_ids } from '../lib/doc_utils.js';
import { KeyMapper, define_keymap } from '../lib/KeyMapper.js';
import { break_text_node, join_text_node } from '../lib/transforms.js';
import { BreakTextNodeCommand } from '../lib/Command.js';
import create_test_session from './create_test_session.js';

function set_title_caret(session: ReturnType<typeof create_test_session>, offset: number) {
	session.selection = {
		type: 'text',
		path: ['story_1', 'title'],
		anchor_offset: offset,
		focus_offset: offset
	};
}

function type_char(session: ReturnType<typeof create_test_session>, char: string) {
	const tr = session.tr;
	tr.insert_text(char);
	session.apply(tr, { batch: true });
}

describe('Session.apply with an invalid resulting selection', () => {
	it('rejects the transaction without swapping the document or touching history', () => {
		const session = create_test_session();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 2,
			focus_offset: 3
		};

		// Empties the body but leaves the transaction's selection at 2..3, which
		// is out of bounds for the resulting document.
		const tr = session.tr;
		tr.set(['page_1', 'body'], { nodes: [], marks: [], annotations: [] });

		expect(() => session.apply(tr)).toThrow('out of bounds');

		// The session must still be in its pre-apply state as a whole: the old
		// document, the old selection and no history entry.
		expect(session.get(['page_1', 'body']).nodes).toEqual(['story_1', 'story_1', 'list_1']);
		expect(session.get('list_1')).toBeDefined();
		expect(session.selection).toEqual({
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 2,
			focus_offset: 3
		});
		expect(session.history.length).toBe(0);
		expect(session.can_undo).toBe(false);
	});
});

describe('Session.apply without ops', () => {
	it('does not record an undo step for a no-op backspace at the start of a node array', () => {
		const session = create_test_session();
		// Caret at the start of the first list item: there is no previous text
		// node to join with, so delete_selection('backward') changes nothing.
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 2, 'list_items', 0, 'content'],
			anchor_offset: 0,
			focus_offset: 0
		};

		const tr = session.tr.delete_selection('backward');
		expect(tr.ops).toEqual([]);
		session.apply(tr);

		expect(session.history.length).toBe(0);
		expect(session.can_undo).toBe(false);
	});

	it('still applies the transaction selection', () => {
		const session = create_test_session();
		set_title_caret(session, 0);

		session.apply(
			session.tr.set_selection({
				type: 'text',
				path: ['story_1', 'title'],
				anchor_offset: 3,
				focus_offset: 5
			})
		);

		expect(session.selection).toEqual({
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 3,
			focus_offset: 5
		});
		expect(session.history.length).toBe(0);
	});

	it('lets a single undo revert the last real edit after a no-op apply', () => {
		const session = create_test_session();
		set_title_caret(session, 11);
		type_char(session, 'a');
		expect(session.get<{ content: string }>(['story_1', 'title']).content).toBe('First storya');

		// A no-op transaction in between must not consume an undo step.
		session.apply(session.tr);
		session.undo();

		expect(session.get<{ content: string }>(['story_1', 'title']).content).toBe('First story');
		expect(session.can_undo).toBe(false);
	});
});

describe('Session.apply batching after a history reset', () => {
	it('starts a fresh entry instead of appending to a missing one', () => {
		const session = create_test_session();
		set_title_caret(session, 11);
		type_char(session, 'a');

		// Resetting the history (e.g. after loading a new document) leaves the
		// batch window open; the next batched apply must not try to extend an
		// entry that no longer exists.
		session.history = [];
		session.history_index = -1;

		expect(() => type_char(session, 'b')).not.toThrow();
		expect(session.get<{ content: string }>(['story_1', 'title']).content).toBe('First storyab');
		expect(session.history.length).toBe(1);
		expect(session.history_index).toBe(0);
	});
});

describe('documents with properties missing from the schema', () => {
	function create_legacy_session() {
		const session = create_test_session();
		const doc = structuredClone(session.doc);
		// A property that an older schema version defined and the current one
		// dropped. validate_node ignores it, so the session accepts the document.
		doc.nodes.page_1.legacy_subtitle = 'kept from an older schema';
		return new Session(session.schema, doc, session.config);
	}

	it('still accepts the document', () => {
		expect(() => create_legacy_session()).not.toThrow();
	});

	it('counts and finds references without touching unknown properties', () => {
		const session = create_legacy_session();

		expect(count_references(session.schema, session.doc, 'story_1')).toBe(2);
		expect(count_references(session.schema, session.doc, 'list_item_1')).toBe(1);
		expect(get_referencing_node_ids(session.schema, session.doc, ['list_1'])).toEqual(['page_1']);
	});

	it('can delete nodes, which re-validates the referrers of deleted nodes', () => {
		const session = create_legacy_session();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 2,
			focus_offset: 3
		};

		expect(() => session.apply(session.tr.delete_selection())).not.toThrow();
		expect(session.get(['page_1', 'body']).nodes).toEqual(['story_1', 'story_1']);
		expect(session.get('list_1')).toBeUndefined();
		expect(session.get('page_1').legacy_subtitle).toBe('kept from an older schema');
	});
});

describe('Transaction.set on a node id', () => {
	it('rejects rewriting the id a node is stored under', () => {
		const session = create_test_session();

		expect(() => session.tr.set(['story_1', 'id'], 'story_2')).toThrow('cannot change a node id');
		expect(session.get('story_1').id).toBe('story_1');
	});
});

describe('KeyMapper.remove_scope', () => {
	function recording_keymap(log: string[], name: string) {
		return define_keymap({
			enter: [{ is_enabled: () => true, execute: () => void log.push(name) }]
		});
	}

	it('removes a scope that is no longer on top, keeping the scope pushed after it', () => {
		// The editor pushes its keymap on focus; a modal pushes its own scope on
		// top while the editor still has focus; then the editor blurs. pop_scope()
		// used to remove the modal's scope here and leave the editor's behind.
		const log: string[] = [];
		const key_mapper = new KeyMapper();
		const app = recording_keymap(log, 'app');
		const editor = recording_keymap(log, 'editor');
		const modal = recording_keymap(log, 'modal');
		key_mapper.push_scope(app);
		key_mapper.push_scope(editor);
		key_mapper.push_scope(modal);

		expect(key_mapper.remove_scope(editor)).toBe(true);
		expect(key_mapper.scope_stack).toEqual([app, modal]);

		key_mapper.handle_keydown(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(log).toEqual(['modal']);
	});

	it('returns false for a scope that is not on the stack', () => {
		const key_mapper = new KeyMapper();
		const app = define_keymap({});
		key_mapper.push_scope(app);
		expect(key_mapper.remove_scope(define_keymap({}))).toBe(false);
		expect(key_mapper.scope_stack).toEqual([app]);
	});

	it('removes only the topmost occurrence of a keymap pushed twice', () => {
		const key_mapper = new KeyMapper();
		const a = define_keymap({});
		const b = define_keymap({});
		key_mapper.push_scope(a);
		key_mapper.push_scope(b);
		key_mapper.push_scope(a);
		key_mapper.remove_scope(a);
		expect(key_mapper.scope_stack).toEqual([a, b]);
	});
});

describe('selection identity', () => {
	// Selections are immutable values stored by reference, like the doc, so
	// they can be compared by identity.
	it('stores the selection object it is given', () => {
		const session = create_test_session();
		const selection = {
			type: 'text' as const,
			path: ['story_1', 'title'],
			anchor_offset: 1,
			focus_offset: 3
		};
		session.selection = selection;
		expect(session.selection).toBe(selection);
	});

	it('keeps the selection object when a transaction does not change it', () => {
		const session = create_test_session();
		set_title_caret(session, 0);
		const before = session.selection;
		const tr = session.tr;
		tr.set(['story_1', 'description'], { content: 'Changed', marks: [], annotations: [] });
		session.apply(tr);
		expect(session.selection).toBe(before);
	});

	it('takes the new selection object when a transaction changes it', () => {
		const session = create_test_session();
		set_title_caret(session, 0);
		const before = session.selection;
		const tr = session.tr;
		tr.insert_text('X');
		session.apply(tr);
		expect(session.selection).not.toBe(before);
		expect(session.selection).toEqual({
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 1,
			focus_offset: 1
		});
	});
});

describe('selections passed as proxies', () => {
	// Framework state (Vue reactive(), Svelte $state) arrives as a Proxy, which
	// structuredClone cannot clone. Session.apply used to deep-clone the
	// selection and threw. A plain Proxy stands in for both here.
	function proxied<T extends object>(value: T): T {
		return new Proxy(value, {});
	}

	it('applies a transaction whose selection is a proxy', () => {
		const session = create_test_session();
		set_title_caret(session, 0);
		const tr = session.tr;
		tr.insert_text('X');
		tr.set_selection(
			proxied({
				type: 'text',
				path: proxied(['story_1', 'title']),
				anchor_offset: 1,
				focus_offset: 1
			})
		);
		expect(() => session.apply(tr)).not.toThrow();
		expect(session.selection).toEqual({
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 1,
			focus_offset: 1
		});
		session.undo();
		expect(session.get(['story_1', 'title']).content).toBe('First story');
	});
});

describe('reusing an applied transaction', () => {
	it('throws instead of mutating the live document', () => {
		// The applied transaction's draft becomes session.doc, so further
		// changes through it used to mutate the live document unnoticed.
		const session = create_test_session();
		const tr = session.tr;
		tr.set(['story_1', 'title'], { content: 'Applied', marks: [], annotations: [] });
		session.apply(tr);
		expect(() =>
			tr.set(['story_1', 'title'], { content: 'Sneaky', marks: [], annotations: [] })
		).toThrow('already been applied');
		expect(session.get(['story_1', 'title']).content).toBe('Applied');
	});
});

describe('text transforms on a top-level text property', () => {
	// A selection like ['paragraph_1', 'content'] has no enclosing node array.
	// Inspecting its "parent" used to call inspect([]), which throws.
	function session_with_top_level_paragraph() {
		const session = create_test_session();
		const tr = session.tr;
		tr.create({
			id: 'paragraph_1',
			type: 'paragraph',
			content: { content: 'Hello', marks: [], annotations: [] }
		});
		session.apply(tr);
		session.selection = {
			type: 'text',
			path: ['paragraph_1', 'content'],
			anchor_offset: 0,
			focus_offset: 0
		};
		return session;
	}

	it('join_text_node and break_text_node do nothing', () => {
		const session = session_with_top_level_paragraph();
		expect(join_text_node(session.tr)).toBe(false);
		expect(break_text_node(session.tr)).toBe(false);
	});

	it('BreakTextNodeCommand is disabled', () => {
		const session = session_with_top_level_paragraph();
		const command = new BreakTextNodeCommand({ session, editable: true });
		expect(command.is_enabled()).toBe(false);
	});
});

describe('break_text_node without an inserter for the new node type', () => {
	it('throws a clear error and leaves the transaction untouched', () => {
		const session = create_test_session();
		const tr = session.tr;
		tr.create({
			id: 'paragraph_1',
			type: 'paragraph',
			content: { content: 'Hello world', marks: [], annotations: [] }
		});
		const body = session.get(['page_1', 'body']);
		tr.set(['page_1', 'body'], { ...body, nodes: ['paragraph_1', ...body.nodes] });
		session.apply(tr);
		session.config = { ...session.config, inserters: {} };
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'content'],
			anchor_offset: 5,
			focus_offset: 5
		};
		const break_tr = session.tr;
		expect(() => break_text_node(break_tr)).toThrow(
			"No inserter function available for node type 'paragraph'"
		);
		expect(break_tr.ops).toEqual([]);
	});
});

describe('batched history entries', () => {
	it('do not change the ops of the transaction that created them', () => {
		const session = create_test_session();
		set_title_caret(session, 0);
		const first = session.tr;
		first.insert_text('a');
		session.apply(first, { batch: true });
		const first_op_count = first.ops.length;
		type_char(session, 'b');
		expect(first.ops.length).toBe(first_op_count);
		expect(session.history[session.history_index].ops.length).toBe(first_op_count * 2);
		session.undo();
		expect(session.get(['story_1', 'title']).content).toBe('First story');
	});
});
