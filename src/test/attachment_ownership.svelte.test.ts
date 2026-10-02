import { describe, expect, it } from 'vitest';
import Session from '../lib/Session.svelte.js';
import { define_document_schema } from '../lib/doc_utils.js';
import { break_text_node } from '../lib/transforms.svelte.js';
import type { Document, DocumentNode, Text } from '../lib/types.js';

const schema = define_document_schema({
	page: {
		kind: 'document',
		properties: {
			body: {
				type: 'node_array',
				node_types: ['paragraph', 'group'],
				default_node_type: 'paragraph'
			}
		}
	},
	group: { kind: 'block', properties: { body: { type: 'node_array', node_types: ['paragraph'] } } },
	paragraph: {
		kind: 'text',
		properties: {
			content: {
				type: 'text',
				allow_newlines: false,
				mark_types: ['link'],
				annotation_types: ['note']
			}
		}
	},
	link: { kind: 'mark', properties: { href: { type: 'string' } } },
	note: { kind: 'annotation', properties: { message: { type: 'string' } } }
});
function fixture() {
	const doc: Document = {
		document_id: 'page',
		nodes: {
			page: {
				id: 'page',
				type: 'page',
				body: { nodes: ['paragraph'], marks: [], annotations: [] }
			},
			paragraph: {
				id: 'paragraph',
				type: 'paragraph',
				content: {
					content: 'abcdef',
					marks: [{ node_id: 'link', start_offset: 0, end_offset: 6 }],
					annotations: [{ node_id: 'note', start_offset: 1, end_offset: 5 }]
				}
			},
			link: { id: 'link', type: 'link', href: '/original' },
			note: { id: 'note', type: 'note', message: 'Original note' }
		}
	};
	const session = new Session(schema, doc, {
		inserters: {
			paragraph: (tr, content: Text) => {
				const id = tr.generate_id();
				tr.create({ id, type: 'paragraph', content });
				tr.insert_nodes([id]);
			}
		}
	});
	return { session, doc };
}
function split(session: Session<typeof schema>, index = 0, offset = 3) {
	session.selection = {
		type: 'text',
		path: ['page', 'body', index, 'content'],
		anchor_offset: offset,
		focus_offset: offset
	};
	const tr = session.tr;
	expect(break_text_node(tr)).toBe(true);
	session.apply(tr);
}
function texts(session: Session<typeof schema>): Text[] {
	return session.get(['page', 'body']).nodes.map((id: string) => session.get([id, 'content']));
}

describe('attachment ownership', () => {
	it('splits links and annotations into independent nodes and supports undo/redo', () => {
		const { session, doc } = fixture();
		split(session);
		const [left, right] = texts(session);
		expect(left.content).toBe('abc');
		expect(right.content).toBe('def');
		expect(left.marks[0].node_id).toBe('link');
		expect(left.annotations[0].node_id).toBe('note');
		const right_link = right.marks[0].node_id;
		const right_note = right.annotations[0].node_id;
		expect(right_link).not.toBe('link');
		expect(right_note).not.toBe('note');
		expect(session.get(right_link).href).toBe('/original');
		expect(session.get(right_note).message).toBe('Original note');
		session.apply(
			session.tr.set([right_link, 'href'], '/updated').set([right_note, 'message'], 'Updated note')
		);
		expect(session.get('link').href).toBe('/original');
		expect(session.get('note').message).toBe('Original note');
		session.undo();
		session.undo();
		expect(session.to_json()).toEqual(doc);
		expect(session.get(right_link)).toBeUndefined();
		expect(session.get(right_note)).toBeUndefined();
		session.redo();
		expect(texts(session)[1].marks[0].node_id).toBe(right_link);
		session.redo();
		expect(session.get(right_link).href).toBe('/updated');
		expect(session.get('link').href).toBe('/original');
	});

	it.each([0, 6])('preserves IDs when ranges move wholly to one side at offset %s', (offset) => {
		const { session } = fixture();
		split(session, 0, offset);
		const nonempty = texts(session).find((text) => text.content)!;
		expect(nonempty.marks[0].node_id).toBe('link');
		expect(nonempty.annotations[0].node_id).toBe('note');
		expect(Object.keys(session.doc.nodes)).toHaveLength(5);
	});

	it('keeps repeated paragraph splits independent', () => {
		const { session } = fixture();
		split(session);
		split(session, 1, 1);
		const values = texts(session);
		expect(new Set(values.flatMap((text) => text.marks.map((range) => range.node_id))).size).toBe(
			3
		);
		expect(
			new Set(values.flatMap((text) => text.annotations.map((range) => range.node_id))).size
		).toBe(3);
	});

	it.each([false, true])(
		'builds independent attachments for repeated ranges with preserve_ids=%s',
		(preserve_ids) => {
			const { session } = fixture();
			const nodes: Record<string, DocumentNode> = {
				group_copy: {
					id: 'group_copy',
					type: 'group',
					body: { nodes: ['first', 'second'], marks: [], annotations: [] }
				},
				copied_link: { id: 'copied_link', type: 'link', href: '/copied' },
				copied_note: { id: 'copied_note', type: 'note', message: 'Copied note' }
			};
			for (const id of ['first', 'second'])
				nodes[id] = {
					id,
					type: 'paragraph',
					content: {
						content: 'Text',
						marks: [{ node_id: 'copied_link', start_offset: 0, end_offset: 4 }],
						annotations: [{ node_id: 'copied_note', start_offset: 0, end_offset: 4 }]
					}
				};
			const original = structuredClone(nodes);
			session.selection = {
				type: 'node',
				path: ['page', 'body'],
				anchor_offset: 1,
				focus_offset: 1
			};
			const tr = session.tr;
			const id = tr.build('group_copy', nodes, { preserve_ids });
			tr.insert_nodes([id]);
			session.apply(tr);
			const children = session.get([id, 'body']).nodes;
			const first = session.get([children[0], 'content']);
			const second = session.get([children[1], 'content']);
			expect(first.marks[0].node_id).not.toBe(second.marks[0].node_id);
			expect(first.annotations[0].node_id).not.toBe(second.annotations[0].node_id);
			session.apply(session.tr.set([second.marks[0].node_id, 'href'], '/changed'));
			expect(session.get(first.marks[0].node_id).href).toBe('/copied');
			expect(nodes).toEqual(original);
		}
	);

	it('pastes text attachments independently of their source', () => {
		const { session } = fixture();
		session.selection = {
			type: 'text',
			path: ['paragraph', 'content'],
			anchor_offset: 6,
			focus_offset: 6
		};
		const nodes = { other: { id: 'other', type: 'link', href: '/pasted' } };
		session.apply(
			session.tr.insert_text(
				' copy',
				[{ node_id: 'other', start_offset: 1, end_offset: 5 }],
				[],
				nodes
			)
		);
		const value = session.get(['paragraph', 'content']);
		const pasted = value.marks.at(-1).node_id;
		expect(pasted).not.toBe('link');
		expect(pasted).not.toBe('other');
		session.apply(session.tr.set([pasted, 'href'], '/edited'));
		expect(session.get('link').href).toBe('/original');
	});
});
