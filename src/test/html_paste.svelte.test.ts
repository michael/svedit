import { describe, expect, it } from 'vitest';
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
