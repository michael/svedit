import { describe, expect, it } from 'vitest';
import Session from '../lib/Session.svelte.js';
import { define_document_schema, fill_document_defaults } from '../lib/doc_utils.js';
import type { Selection } from '../lib/types.js';

const schema = define_document_schema({
	page: {
		kind: 'document',
		properties: {
			footer: { type: 'node', node_types: ['footer'] },
			body: { type: 'node_array', node_types: ['footer', 'paragraph'] }
		}
	},
	footer: {
		kind: 'block',
		properties: { columns: { type: 'node_array', node_types: ['column'] } }
	},
	column: { kind: 'block', properties: { links: { type: 'node_array', node_types: ['link'] } } },
	link: { kind: 'block', properties: { label: { type: 'text', allow_newlines: false } } },
	paragraph: { kind: 'text', properties: { content: { type: 'text', allow_newlines: true } } }
});
function fixture() {
	return new Session(
		schema,
		fill_document_defaults(
			{
				document_id: 'page',
				nodes: {
					page: {
						id: 'page',
						type: 'page',
						footer: 'footer',
						body: { nodes: ['footer'], marks: [], annotations: [] }
					},
					footer: {
						id: 'footer',
						type: 'footer',
						columns: { nodes: ['column'], marks: [], annotations: [] }
					},
					column: {
						id: 'column',
						type: 'column',
						links: { nodes: ['link'], marks: [], annotations: [] }
					},
					link: {
						id: 'link',
						type: 'link',
						label: { content: 'Contact', marks: [], annotations: [] }
					}
				}
			},
			schema
		),
		{}
	);
}

describe('paste ancestor insertion carets', () => {
	it('stops at a root single-node reference after rejecting all ancestor arrays', () => {
		const session = fixture();
		const selection: Selection = {
			type: 'text',
			path: ['page', 'footer', 'columns', 0, 'links', 0, 'label'],
			anchor_offset: 0,
			focus_offset: 0
		};
		session.selection = selection;
		const before = JSON.stringify(session.doc);
		const links = session.get_next_node_insert_caret(selection)!;
		expect(links.path).toEqual(['page', 'footer', 'columns', 0, 'links']);
		expect(() => session.tr.set_selection(links)).not.toThrow();
		const columns = session.get_next_node_insert_caret(links)!;
		expect(columns.path).toEqual(['page', 'footer', 'columns']);
		expect(() => session.tr.set_selection(columns)).not.toThrow();
		expect(session.get_next_node_insert_caret(columns)).toBeNull();
		expect(session.can_insert('paragraph')).toBe(false);
		expect(session.selection).toEqual(selection);
		expect(JSON.stringify(session.doc)).toBe(before);
	});

	it('can continue to a compatible ancestor array when one exists', () => {
		const session = fixture();
		const columns: Selection = {
			type: 'node',
			path: ['page', 'body', 0, 'columns'],
			anchor_offset: 0,
			focus_offset: 0
		};
		const parent = session.get_next_node_insert_caret(columns)!;
		expect(parent).toEqual({
			type: 'node',
			path: ['page', 'body'],
			anchor_offset: 1,
			focus_offset: 1
		});
		expect(() => session.tr.set_selection(parent)).not.toThrow();
		expect(session.can_insert('paragraph', columns)).toBe(true);
	});

	it('returns no ancestor for null selections or root single-node references', () => {
		const session = fixture();
		expect(session.get_next_node_insert_caret(null)).toBeNull();
		expect(
			session.get_next_node_insert_caret({ type: 'property', path: ['page', 'footer'] })
		).toBeNull();
	});
});
