import { describe, expect, it } from 'vitest';
import Session from '../lib/Session.svelte.js';
import { parse_html_paste, map_html_text, map_html_blocks } from '../lib/html_paste.js';
import type { HtmlPasteConfig } from '../lib/html_paste.js';
import type { DocumentNode, DocumentSchema, PropertyDefinition } from '../lib/types.js';

const text_property: PropertyDefinition = {
	type: 'text',
	allow_newlines: true,
	mark_types: ['strong', 'link']
};
const schema: DocumentSchema = {
	paragraph: { kind: 'text', properties: { content: text_property } },
	heading: { kind: 'text', properties: { content: text_property, level: { type: 'number' } } },
	strong: { kind: 'mark', properties: {} },
	link: { kind: 'mark', properties: { href: { type: 'string' } } }
};
const config: HtmlPasteConfig = {
	blocks: {
		p: { type: 'paragraph', text_property: 'content' },
		h1: ({ tag }) => ({
			type: 'heading',
			text_property: 'content',
			properties: { level: Number(tag[1]) }
		})
	},
	marks: { bold: { type: 'strong' }, link: ({ href }) => ({ type: 'link', properties: { href } }) }
};
const body: PropertyDefinition = {
	type: 'node_array',
	node_types: ['paragraph', 'heading'],
	default_node_type: 'paragraph'
};
function import_text(html: string, property = text_property) {
	const nodes: Record<string, DocumentNode> = {};
	const text = map_html_text(parse_html_paste(html), config, schema, property, nodes);
	return { text, nodes, marks: text.marks.map((mark) => ({ ...mark, node: nodes[mark.node_id] })) };
}

describe('external HTML import', () => {
	it('maps heading factories and falls back for unmapped or disallowed headings', () => {
		const blocks = parse_html_paste('<div><h1>Title</h1><p>Body</p><h6>Small</h6></div>');
		const payload = map_html_blocks(blocks, config, schema, body)!;
		expect(payload.main_nodes.map((id) => payload.nodes[id].type)).toEqual([
			'heading',
			'paragraph',
			'paragraph'
		]);
		expect(payload.nodes[payload.main_nodes[0]].level).toBe(1);
		const restricted = map_html_blocks(blocks, config, schema, {
			...body,
			node_types: ['paragraph']
		})!;
		expect(restricted.main_nodes.every((id) => restricted.nodes[id].type === 'paragraph')).toBe(
			true
		);
	});

	it('preserves link precedence and bold around links with exclusive grapheme ranges', () => {
		const { text, marks } = import_text(
			'<b>👋🏽 <a href="https://example.com">e\u0301<strong>!</strong></a> end</b>'
		);
		expect(text.content).toBe('👋🏽 e\u0301! end');
		expect(marks.map((mark) => [mark.start_offset, mark.end_offset, mark.node.type])).toEqual([
			[0, 2, 'strong'],
			[2, 4, 'link'],
			[4, 8, 'strong']
		]);
		expect(marks[1].node.href).toBe('https://example.com');
	});

	it('handles graphemes spanning element boundaries', () => {
		const { text } = import_text('<b>e</b><a href="/test">\u0301!</a>');
		expect(text.content).toBe('e\u0301!');
		expect(text.marks).toHaveLength(1);
		expect(text.marks[0]).toMatchObject({ start_offset: 0, end_offset: 2 });
	});

	it('normalizes wrappers, entities and breaks while ignoring executable content', () => {
		const { text } = import_text(
			'<div> Hello <span>  &amp; <b>world</b></span><br> next</div><p>Last</p><script>bad()</script><style>body{}</style>'
		);
		expect(text.content).toBe('Hello & world\nnext\n\nLast');
	});

	it('reads bold from inline font-weight in Google Docs clipboards', () => {
		const { text, marks } = import_text(
			'<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1234">' +
				'<p dir="ltr"><span style="font-weight:400;">Plain </span><span style="font-weight:700;">bold</span></p>' +
				'<br><p dir="ltr"><span style="font-weight:400;">Next</span></p></b>'
		);
		expect(text.content).toBe('Plain bold\n\nNext');
		expect(marks.map((mark) => [mark.start_offset, mark.end_offset, mark.node.type])).toEqual([
			[6, 10, 'strong']
		]);
	});

	it('reads bold from Word clipboards and drops empty paragraphs', () => {
		const { text, marks } = import_text(
			'<p class="MsoNormal"><b><span>Bold</span></b> and <span style="font-weight:bold">styled</span></p>' +
				'<p class="MsoNormal"><o:p>&nbsp;</o:p></p><p><br></p><p class="MsoNormal">Next</p>'
		);
		expect(text.content).toBe('Bold and styled\n\nNext');
		expect(marks.map((mark) => [mark.start_offset, mark.end_offset])).toEqual([
			[0, 4],
			[9, 15]
		]);
	});

	it('drops unsafe links while retaining their text and other supported formatting', () => {
		for (const href of ['javascript:alert(1)', 'java&#10;script:alert(1)', 'data:text/html,bad']) {
			const { text, marks } = import_text(`<a href="${href}"><b>keep</b></a>`);
			expect(text.content).toBe('keep');
			expect(marks.map((mark) => mark.node.type)).toEqual(['strong']);
		}
	});

	it('flattens blocks and drops unsupported marks in restricted fields', () => {
		const { text, nodes } = import_text(
			'<h1><b>Title</b></h1><p><a href="/x">Next<br>line</a></p>',
			{ type: 'text', allow_newlines: false, mark_types: [] }
		);
		expect(text).toEqual({ content: 'Title Next line', marks: [], annotations: [] });
		expect(nodes).toEqual({});
	});

	it('returns no payload for empty HTML or a destination without text nodes', () => {
		expect(parse_html_paste('<meta charset="utf-8"><div> </div>')).toEqual([]);
		expect(
			map_html_blocks(parse_html_paste('<p>Hello</p>'), config, schema, {
				type: 'node_array',
				node_types: []
			})
		).toBeNull();
	});
});

const list_schema: DocumentSchema = {
	...schema,
	collection: {
		kind: 'block',
		properties: {
			format: { type: 'string' },
			entries: { type: 'node_array', node_types: ['entry'] }
		}
	},
	entry: { kind: 'text', properties: { content: text_property, label: text_property } },
	container: {
		kind: 'block',
		properties: {
			children: { ...body, node_types: ['paragraph', 'heading', 'collection'] }
		}
	},
	root: {
		kind: 'document',
		properties: { blocks: { type: 'node_array', node_types: ['container'] } }
	}
};
const list_mapping = {
	type: 'collection',
	children_property: 'entries',
	item: { type: 'entry', text_property: 'label' },
	properties: { format: 'bullets' }
};
const list_config: HtmlPasteConfig = {
	...config,
	lists: {
		ul: list_mapping,
		ol: { ...list_mapping, properties: { format: 'numbers' } }
	},
	wrapper: { type: 'container', children_property: 'children' }
};
const list_body = list_schema.container.properties.children;

describe('schema-defined HTML lists', () => {
	it.each(['ul', 'ol'])('maps %s lists with arbitrary schema names and flattens nesting', (tag) => {
		const html = `<p>Before</p><${tag}><li><b>Parent<ul><li>Child</li></ul></b></li><li><p>One</p><p>Two</p></li></${tag}><p>After</p>`;
		const payload = map_html_blocks(parse_html_paste(html), list_config, list_schema, list_body)!;
		const blocks = payload.main_nodes.map((id) => payload.nodes[id]);
		expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'collection', 'paragraph']);
		const list = blocks[1];
		expect(list.format).toBe(tag === 'ul' ? 'bullets' : 'numbers');
		const items = list.entries.nodes.map((id: string) => payload.nodes[id]);
		expect(items.map((item: DocumentNode) => item.label.content)).toEqual([
			'Parent',
			'Child',
			'One\n\nTwo'
		]);
		expect(items.every((item: DocumentNode) => item.type === 'entry')).toBe(true);
		for (const item of items.slice(0, 2)) {
			expect(item.label.marks).toHaveLength(1);
			expect(payload.nodes[item.label.marks[0].node_id].type).toBe('strong');
		}
	});

	it('wraps only when needed and inserts the graph as one undoable transaction', () => {
		const session = new Session(
			list_schema,
			{
				document_id: 'root_1',
				nodes: {
					root_1: { id: 'root_1', type: 'root', blocks: { nodes: [], marks: [], annotations: [] } }
				}
			},
			{}
		);
		session.selection = {
			type: 'node',
			path: ['root_1', 'blocks'],
			anchor_offset: 0,
			focus_offset: 0
		};
		const before = JSON.stringify(session.doc);
		const payload = map_html_blocks(
			parse_html_paste('<ol><li><b>Item</b></li></ol>'),
			list_config,
			list_schema,
			list_schema.root.properties.blocks
		)!;
		expect(payload.nodes[payload.main_nodes[0]].type).toBe('container');
		const tr = session.tr;
		tr.insert_nodes(payload.main_nodes.map((id) => tr.build(id, payload.nodes)));
		session.apply(tr);
		const after = JSON.stringify(session.doc);
		session.undo();
		expect(JSON.stringify(session.doc)).toBe(before);
		session.redo();
		expect(JSON.stringify(session.doc)).toBe(after);
		const direct = map_html_blocks(
			parse_html_paste('<ul><li>Item</li></ul>'),
			list_config,
			list_schema,
			list_body
		)!;
		expect(direct.nodes[direct.main_nodes[0]].type).toBe('collection');
	});

	it('flattens unmapped, disallowed, and invalid list mappings into default text nodes', () => {
		const blocks = parse_html_paste('<ul><li>Parent<ol><li>Child</li></ol></li><li>Last</li></ul>');
		for (const { mapping, target } of [
			{ mapping: config, target: list_body },
			{ mapping: list_config, target: body },
			{
				mapping: {
					...list_config,
					lists: { ul: { ...list_mapping, children_property: 'missing' } }
				},
				target: list_body
			}
		]) {
			const payload = map_html_blocks(blocks, mapping, list_schema, target)!;
			expect(payload.main_nodes.map((id) => payload.nodes[id].content.content)).toEqual([
				'Parent',
				'Child',
				'Last'
			]);
		}
	});

	it('flattens lists in text fields and ignores lists inside executable containers', () => {
		const nodes: Record<string, DocumentNode> = {};
		const blocks = parse_html_paste(
			'<ol><li><b>One</b></li><li>Two</li></ol><object><ul><li>Ignored</li></ul></object>'
		);
		const text = map_html_text(
			blocks,
			list_config,
			list_schema,
			{ type: 'text', allow_newlines: false, mark_types: [] },
			nodes
		);
		expect(text).toEqual({ content: 'One Two', marks: [], annotations: [] });
		expect(nodes).toEqual({});
	});
});
