import { describe, expect, it } from 'vitest';
import create_test_session from './create_test_session.js';
import {
	check_config_completeness,
	validate_document_schema
} from '../lib/doc_utils.js';
import { insert_default_node, break_text_node } from '../lib/transforms.svelte.js';

// A fresh session whose shared module-level config is cloned, so per-test
// mutations (removing inserters/components) don't leak into other tests.
function create_isolated_session() {
	const session = create_test_session();
	session.schema = structuredClone(session.schema);
	session.config = {
		...session.config,
		node_components: { ...session.config.node_components },
		inserters: { ...session.config.inserters }
	};
	return session;
}

describe('check_config_completeness', () => {
	it('returns no warnings for a complete setup', () => {
		const session = create_isolated_session();
		expect(check_config_completeness(session.schema, session.config)).toEqual([]);
	});

	it('warns about node types without a registered component', () => {
		const session = create_isolated_session();
		delete session.config.node_components.story;

		const warnings = check_config_completeness(session.schema, session.config);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("'story'");
		expect(warnings[0]).toContain('UnknownNode');
	});

	it('does not require components for mark and annotation types', () => {
		const session = create_isolated_session();
		session.schema.strong = { kind: 'mark', properties: {} };
		session.schema.comment = { kind: 'annotation', properties: {} };
		/** @type {any} */ (session.schema.story.properties.title).mark_types = ['strong'];
		/** @type {any} */ (session.schema.story.properties.title).annotation_types = ['comment'];

		expect(check_config_completeness(session.schema, session.config)).toEqual([]);
	});

	it('warns about mark and annotation types no property allows', () => {
		const session = create_isolated_session();
		session.schema.strong = { kind: 'mark', properties: {} };

		const warnings = check_config_completeness(session.schema, session.config);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("'strong'");
		expect(warnings[0]).toContain('never be applied');
	});

	it('warns when a default node type cannot be auto-inserted and has no custom inserter', () => {
		const session = create_isolated_session();
		// An asset reference without a default cannot be fabricated from schema
		// defaults, so a paragraph without a custom inserter is not insertable.
		session.schema.asset = { kind: 'block', properties: { url: { type: 'string' } } };
		session.config.node_components.asset = session.config.node_components.story;
		session.schema.paragraph.properties.asset = { type: 'node', node_types: ['asset'] };
		delete session.config.inserters.paragraph;

		const warnings = check_config_completeness(session.schema, session.config);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("'paragraph'");
		expect(warnings[0]).toContain("config.inserters['paragraph']");
	});

	it('accepts a default node type covered by the generic inserter', () => {
		const session = create_isolated_session();
		delete session.config.inserters.paragraph;
		expect(check_config_completeness(session.schema, session.config)).toEqual([]);
	});
});

describe('schema validation of node_types kinds', () => {
	it('rejects node_types referencing mark or annotation types', () => {
		const session = create_isolated_session();
		const schema = structuredClone(session.schema);
		schema.strong = { kind: 'mark', properties: {} };
		/** @type {any} */ (schema.page.properties.body).node_types = ['paragraph', 'strong'];

		expect(() => validate_document_schema(schema)).toThrow(
			'node_types must not reference mark or annotation types, got: strong'
		);
	});
});

describe('generic schema-driven inserter', () => {
	it('insert_default_node inserts a schema-default node without a custom inserter', () => {
		const session = create_isolated_session();
		delete session.config.inserters.paragraph;

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 0
		};
		const tr = session.tr;
		expect(insert_default_node(tr)).toBe(true);
		session.apply(tr);

		const body = session.get(['page_1', 'body']);
		expect(body.nodes).toHaveLength(4);
		const new_node = session.get(body.nodes[0]);
		expect(new_node.type).toBe('paragraph');
		expect(new_node.content).toEqual({ content: '', marks: [], annotations: [] });
		// The caret is placed at the start of the new node's content
		expect(session.selection).toEqual({
			type: 'text',
			path: ['page_1', 'body', 0, 'content'],
			anchor_offset: 0,
			focus_offset: 0
		});
	});

	it('break_text_node splits without a custom inserter and carries the right part over', () => {
		const session = create_isolated_session();
		delete session.config.inserters.list_item;

		// 'first list item' — split after 'first'
		session.selection = {
			type: 'text',
			path: ['list_1', 'list_items', 0, 'content'],
			anchor_offset: 5,
			focus_offset: 5
		};
		const tr = session.tr;
		expect(break_text_node(tr)).toBe(true);
		session.apply(tr);

		const list_items = session.get(['list_1', 'list_items']);
		expect(list_items.nodes).toHaveLength(3);
		expect(session.get(list_items.nodes[0]).content.content).toBe('first');
		expect(session.get(list_items.nodes[1]).content.content).toBe(' list item');
	});

	it('throws a hint naming config.inserters when defaults cannot construct the node', () => {
		const session = create_isolated_session();
		session.schema.asset = { kind: 'block', properties: { url: { type: 'string' } } };
		session.schema.paragraph.properties.asset = { type: 'node', node_types: ['asset'] };
		delete session.config.inserters.paragraph;

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 0
		};
		expect(() => insert_default_node(session.tr)).toThrow("config.inserters['paragraph']");
	});
});
