import { describe, expect, it } from 'vitest';
import Session from '../lib/Session.svelte.js';
import { define_document_schema } from '../lib/doc_utils.js';
import type { DocumentNode } from '../lib/types.js';

const schema = define_document_schema({
	page: {
		kind: 'document',
		properties: { body: { type: 'node_array', node_types: ['group'], annotation_types: ['note'] } }
	},
	group: { kind: 'block', properties: { children: { type: 'node_array', node_types: ['text'] } } },
	text: {
		kind: 'text',
		properties: { content: { type: 'text', allow_newlines: true, mark_types: ['strong'] } }
	},
	strong: { kind: 'mark', properties: {} },
	note: { kind: 'annotation', properties: {} }
});

function fixture() {
	const nodes: Record<string, DocumentNode> = {
		group_1: {
			id: 'group_1',
			type: 'group',
			children: { nodes: ['text_1'], marks: [], annotations: [] }
		},
		text_1: {
			id: 'text_1',
			type: 'text',
			content: {
				content: 'Hello',
				marks: [{ node_id: 'strong_1', start_offset: 0, end_offset: 5 }],
				annotations: []
			}
		},
		strong_1: { id: 'strong_1', type: 'strong' },
		note_1: { id: 'note_1', type: 'note' }
	};
	const session = new Session(
		schema,
		{
			document_id: 'page_1',
			nodes: {
				page_1: { id: 'page_1', type: 'page', body: { nodes: [], marks: [], annotations: [] } }
			}
		},
		{}
	);
	session.selection = { type: 'node', path: ['page_1', 'body'], anchor_offset: 0, focus_offset: 0 };
	return { session, nodes };
}

function paste(session: Session<typeof schema>, nodes: Record<string, DocumentNode>) {
	const tr = session.tr;
	const preserve_ids = Object.values(nodes).every((node) => !tr.doc.nodes[node.id]);
	const id = tr.build('group_1', nodes, { preserve_ids });
	tr.insert_nodes([id], [], [{ node_id: 'note_1', start_offset: 0, end_offset: 1 }], nodes, {
		preserve_ids
	});
	session.apply(tr);
	return id;
}

describe('clipboard subtree identities', () => {
	it('preserves nested nodes and attachments for a collision-free paste without mutating the clipboard', () => {
		const { session, nodes } = fixture();
		const clipboard = structuredClone(nodes);
		expect(paste(session, nodes)).toBe('group_1');
		for (const [id, node] of Object.entries(nodes)) expect(session.doc.nodes[id]).toEqual(node);
		expect(session.get(['page_1', 'body']).annotations[0].node_id).toBe('note_1');
		expect(nodes).toEqual(clipboard);
	});

	it('preserves IDs after cutting and reinserting a subtree', () => {
		const { session, nodes } = fixture();
		paste(session, nodes);
		session.apply(session.tr.delete_selection());
		for (const id of Object.keys(nodes)) expect(session.doc.nodes[id]).toBeUndefined();
		expect(paste(session, nodes)).toBe('group_1');
		for (const [id, node] of Object.entries(nodes)) expect(session.doc.nodes[id]).toEqual(node);
		session.undo();
		for (const id of Object.keys(nodes)) expect(session.doc.nodes[id]).toBeUndefined();
		session.undo();
		for (const [id, node] of Object.entries(nodes)) expect(session.doc.nodes[id]).toEqual(node);
		session.redo();
		session.redo();
		for (const [id, node] of Object.entries(nodes)) expect(session.doc.nodes[id]).toEqual(node);
	});

	it('remaps every node when any clipboard attachment collides', () => {
		const { session, nodes } = fixture();
		session.apply(
			session.tr
				.create(nodes.note_1)
				.set(['page_1', 'body'], { nodes: [], marks: [], annotations: [] })
		);
		const id = paste(session, nodes);
		expect(id).not.toBe('group_1');
		const child_id = session.doc.nodes[id].children.nodes[0];
		expect(child_id).not.toBe('text_1');
		expect(session.doc.nodes[child_id].content.marks[0].node_id).not.toBe('strong_1');
		expect(session.get(['page_1', 'body']).annotations[0].node_id).not.toBe('note_1');
		expect(session.doc.nodes.note_1).toEqual(nodes.note_1);
	});

	it('remaps a repeated paste while leaving the first subtree intact', () => {
		const { session, nodes } = fixture();
		paste(session, nodes);
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 1,
			focus_offset: 1
		};
		expect(paste(session, nodes)).not.toBe('group_1');
		expect(session.get(['page_1', 'body']).nodes).toHaveLength(2);
		for (const [id, node] of Object.entries(nodes)) expect(session.doc.nodes[id]).toEqual(node);
	});

	it('keeps default build behavior and rejects preservation when a descendant collides', () => {
		const { session, nodes } = fixture();
		expect(session.tr.build('group_1', nodes)).not.toBe('group_1');
		const tr = session.tr.create(nodes.strong_1);
		const id = tr.build('group_1', nodes, { preserve_ids: true });
		expect(id).not.toBe('group_1');
		expect(tr.doc.nodes[id].children.nodes[0]).not.toBe('text_1');
	});
});
