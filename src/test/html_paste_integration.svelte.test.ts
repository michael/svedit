import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import Strong from '../routes/components/Strong.svelte';
import Link from '../routes/components/Link.svelte';
import create_test_session from './create_test_session.js';
import type { Selection } from '../lib/types.js';
import type { HtmlPasteConfig } from '../lib/html_paste.js';

const config: HtmlPasteConfig = {
	blocks: {
		p: { type: 'paragraph', text_property: 'content' },
		h1: { type: 'heading_1', text_property: 'content' }
	}
};
async function setup(selection: Selection, html_paste: HtmlPasteConfig | undefined = config) {
	const session = create_test_session();
	session.config = { ...session.config, html_paste };
	const { container } = render(SveditTest, { session });
	(container.querySelector('.svedit-canvas') as HTMLElement).focus();
	await tick();
	session.selection = selection;
	await tick();
	return session;
}
async function paste(html: string, plain_text = 'plain fallback') {
	const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'clipboardData', {
		value: {
			items: [],
			getData: (format: string) => (format === 'text/html' ? html : plain_text)
		}
	});
	document.dispatchEvent(event);
	await tick();
}
const node_selection: Selection = {
	type: 'node',
	path: ['page_1', 'body'],
	anchor_offset: 3,
	focus_offset: 3
};
const title_selection: Selection = {
	type: 'text',
	path: ['page_1', 'body', 0, 'title'],
	anchor_offset: 0,
	focus_offset: 11
};

describe('HTML clipboard integration', () => {
	it('retains multi-paragraph insertion for lists without mappings', async () => {
		const session = await setup(node_selection);
		await paste('<p>Existing</p>');
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 3, 'content'],
			anchor_offset: 0,
			focus_offset: 0
		};
		await tick();
		await paste('<ul><li>First</li><li>Second</li></ul>');
		const nodes = session
			.get(['page_1', 'body'])
			.nodes.slice(3)
			.map((id) => session.get(id));
		expect(nodes.map((node) => node.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
		expect(nodes.map((node) => node.content.content)).toEqual(['Existing', 'First', 'Second']);
	});

	it('inserts a configured single-item list after a text node', async () => {
		const session = await setup(node_selection);
		session.config.html_paste = {
			...config,
			lists: {
				ul: {
					type: 'list',
					children_property: 'list_items',
					item: { type: 'list_item', text_property: 'content' },
					properties: { layout: 'square' }
				}
			}
		};
		await paste('<p>Existing</p>');
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 3, 'content'],
			anchor_offset: 0,
			focus_offset: 0
		};
		await tick();
		await paste('<ul><li>Item</li></ul>');
		const body = session.get(['page_1', 'body']);
		const list = session.get(body.nodes[4]);
		expect(list.type).toBe('list');
		expect(session.get(list.list_items.nodes[0]).content.content).toBe('Item');
		expect(session.get(body.nodes[3]).content.content).toBe('Existing');
		session.undo();
		expect(session.get(['page_1', 'body']).nodes).toHaveLength(4);
	});

	it.each(['html', 'native'])(
		'converts %s paragraphs to list items with attachments and undo',
		async (format) => {
			const session = await setup(
				{
					type: 'node',
					path: ['page_1', 'body', 2, 'list_items'],
					anchor_offset: 2,
					focus_offset: 2
				},
				{
					...config,
					marks: {
						bold: { type: 'strong' },
						link: ({ href }) => ({ type: 'link', properties: { href } })
					}
				}
			);
			session.schema = JSON.parse(JSON.stringify(session.schema));
			session.schema.strong = { kind: 'mark', properties: {} };
			session.schema.link = { kind: 'mark', properties: { href: { type: 'string' } } };
			session.schema.comment = { kind: 'annotation', properties: {} };
			session.schema.list_item.properties.content.mark_types = ['strong', 'link'];
			session.schema.list_item.properties.content.annotation_types = ['comment'];
			session.config = {
				...session.config,
				node_components: { ...session.config.node_components, strong: Strong, link: Link }
			};
			const payload = {
				main_nodes: ['copied_bold', 'copied_link'],
				nodes: {
					copied_bold: {
						id: 'copied_bold',
						type: 'paragraph',
						content: {
							content: 'Bold',
							marks: [{ node_id: 'bold_mark', start_offset: 0, end_offset: 4 }],
							annotations: [{ node_id: 'comment_1', start_offset: 0, end_offset: 4 }]
						}
					},
					copied_link: {
						id: 'copied_link',
						type: 'paragraph',
						content: {
							content: 'Link',
							marks: [{ node_id: 'link_mark', start_offset: 0, end_offset: 4 }],
							annotations: []
						}
					},
					bold_mark: { id: 'bold_mark', type: 'strong' },
					link_mark: { id: 'link_mark', type: 'link', href: 'https://example.com' },
					comment_1: { id: 'comment_1', type: 'comment' }
				}
			};
			const clipboard_before = JSON.stringify(payload);
			const encoded = btoa(encodeURIComponent(clipboard_before));
			const html =
				format === 'native'
					? `<span data-svedit="${encoded}"></span>`
					: '<p><b>Bold</b></p><p><a href="https://example.com">Link</a></p>';
			const before = JSON.stringify(session.doc);
			await paste(html);
			const end = session.get(['list_1', 'list_items']).nodes.length;
			session.selection = {
				type: 'node',
				path: ['page_1', 'body', 2, 'list_items'],
				anchor_offset: end,
				focus_offset: end
			};
			await tick();
			await paste(html);
			const item_ids = session.get(['list_1', 'list_items']).nodes.slice(2);
			expect(item_ids).toHaveLength(4);
			const mark_ids: string[] = [];
			for (const [index, id] of item_ids.entries()) {
				const item = session.get(id);
				expect(item.type).toBe('list_item');
				expect(item.content.content).toBe(index % 2 === 0 ? 'Bold' : 'Link');
				expect(item.content.marks).toHaveLength(1);
				const mark = item.content.marks[0];
				expect([mark.start_offset, mark.end_offset]).toEqual([0, 4]);
				expect(session.get(mark.node_id).type).toBe(index % 2 === 0 ? 'strong' : 'link');
				if (index % 2 === 1) expect(session.get(mark.node_id).href).toBe('https://example.com');
				mark_ids.push(mark.node_id);
				if (format === 'native' && index % 2 === 0) {
					expect(item.content.annotations).toHaveLength(1);
					expect(session.get(item.content.annotations[0].node_id).type).toBe('comment');
				}
			}
			expect(new Set(mark_ids).size).toBe(4);
			expect(JSON.stringify(payload)).toBe(clipboard_before);
			const after = JSON.stringify(session.doc);
			session.undo();
			session.undo();
			expect(JSON.stringify(session.doc)).toBe(before);
			session.redo();
			session.redo();
			expect(JSON.stringify(session.doc)).toBe(after);
		}
	);

	it('inserts mapped blocks at a node caret as one undoable change', async () => {
		const session = await setup(node_selection);
		const before = JSON.stringify(session.doc);
		await paste('<h1>Heading</h1><p>Paragraph</p>');
		const body = session.get(['page_1', 'body']);
		expect(body.nodes).toHaveLength(5);
		expect(session.get(body.nodes[3])).toMatchObject({
			type: 'heading_1',
			content: { content: 'Heading' }
		});
		expect(session.get(body.nodes[4])).toMatchObject({
			type: 'paragraph',
			content: { content: 'Paragraph' }
		});
		session.undo();
		expect(JSON.stringify(session.doc)).toBe(before);
	});

	it('replaces selected field text with flattened HTML and restores it on undo', async () => {
		const session = await setup(title_selection);
		await paste('<h1>New</h1><p>title<br>here</p>');
		expect(session.get(['story_1', 'title']).content).toBe('New title here');
		session.undo();
		expect(session.get(['story_1', 'title']).content).toBe('First story');
	});

	it('keeps the existing type when a single heading is pasted into text', async () => {
		const session = await setup(title_selection);
		await paste('<h1>New title</h1>');
		expect(session.get('story_1').type).toBe('story');
		expect(session.get(['story_1', 'title']).content).toBe('New title');
		expect(session.get(['page_1', 'body']).nodes).toHaveLength(3);
	});

	it('leaves native payloads in control even when HTML mapping is configured', async () => {
		const mapping = vi.fn(() => {
			throw new Error('Native paste must not call HTML mapping');
		});
		const session = await setup(node_selection, { blocks: { h1: mapping } });
		const payload = {
			main_nodes: ['native_paragraph'],
			nodes: {
				native_paragraph: {
					id: 'native_paragraph',
					type: 'paragraph',
					content: { content: 'Native content', marks: [], annotations: [] }
				}
			}
		};
		const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
		await paste(`<span data-svedit="${encoded}"></span><h1>Fallback heading</h1>`);
		expect(mapping).not.toHaveBeenCalled();
		expect(session.get('native_paragraph').content.content).toBe('Native content');
	});

	it('preserves imported marks through insertion and undo', async () => {
		const session = await setup(title_selection, {
			marks: {
				bold: { type: 'strong' },
				link: ({ href }) => ({ type: 'link', properties: { href } })
			}
		});
		session.schema = JSON.parse(JSON.stringify(session.schema));
		session.schema.strong = { kind: 'mark', properties: {} };
		session.schema.link = { kind: 'mark', properties: { href: { type: 'string' } } };
		session.schema.story.properties.title.mark_types = ['strong', 'link'];
		session.config = {
			...session.config,
			node_components: { ...session.config.node_components, strong: Strong, link: Link }
		};
		const before = JSON.stringify(session.doc);
		await paste('<b>Bold</b> <a href="https://example.com">link</a>');
		const text = session.get(['story_1', 'title']);
		expect(text.content).toBe('Bold link');
		expect(
			text.marks.map((mark) => [mark.start_offset, mark.end_offset, session.get(mark.node_id).type])
		).toEqual([
			[0, 4, 'strong'],
			[5, 9, 'link']
		]);
		expect(session.get(text.marks[1].node_id).href).toBe('https://example.com');
		session.undo();
		expect(JSON.stringify(session.doc)).toBe(before);
	});

	it('keeps existing multi-block insertion behavior inside a text node', async () => {
		const session = await setup(node_selection);
		await paste('<p>Existing text</p>');
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 3, 'content'],
			anchor_offset: 0,
			focus_offset: 8
		};
		await tick();
		await paste('<h1>Heading</h1><p>Paragraph</p>');
		const body = session.get(['page_1', 'body']);
		expect(body.nodes).toHaveLength(6);
		expect(session.get(body.nodes[3]).content.content).toBe('Existing text');
		expect(session.get(body.nodes[4]).type).toBe('heading_1');
		expect(session.get(body.nodes[5]).content.content).toBe('Paragraph');
	});

	it('copies clipped rich text as HTML alongside unchanged native marks and annotations', async () => {
		const session = await setup(title_selection);
		session.schema = JSON.parse(JSON.stringify(session.schema));
		session.schema.strong = { kind: 'mark', properties: {} };
		session.schema.comment = { kind: 'annotation', properties: {} };
		session.schema.story.properties.title.mark_types = ['strong'];
		session.schema.story.properties.title.annotation_types = ['comment'];
		session.config = {
			...session.config,
			mark_html_exporters: { strong: (_node, content) => `<strong>${content}</strong>` },
			node_components: { ...session.config.node_components, strong: Strong }
		};
		const tr = session.tr;
		tr.create({ id: 'copy_bold', type: 'strong' });
		tr.create({ id: 'copy_comment', type: 'comment' });
		tr.set(['story_1', 'title'], {
			content: 'A👋🏽<&Z',
			marks: [{ node_id: 'copy_bold', start_offset: 1, end_offset: 4 }],
			annotations: [{ node_id: 'copy_comment', start_offset: 0, end_offset: 5 }]
		});
		tr.set_selection({ ...title_selection, type: 'text', anchor_offset: 1, focus_offset: 4 });
		session.apply(tr);
		await tick();
		const native = session.get_selected_text();
		const clipboard: Record<string, string> = {};
		const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'clipboardData', {
			value: {
				setData: (format: string, value: string) => {
					clipboard[format] = value;
				}
			}
		});
		document.dispatchEvent(event);
		expect(clipboard['text/plain']).toBe('👋🏽<&');
		expect(clipboard['text/html']).toContain('<strong>👋🏽&lt;&amp;</strong>');
		const encoded = clipboard['text/html'].match(/data-svedit="([^"]+)"/)![1];
		expect(JSON.parse(decodeURIComponent(atob(encoded)))).toEqual(native);
		expect(native!.annotations).toHaveLength(1);
	});

	it('retains plain-text behavior without configuration', async () => {
		const session = await setup(title_selection);
		session.config = { ...session.config, html_paste: undefined };
		await paste('<h1>HTML title</h1>', 'Plain title');
		expect(session.get(['story_1', 'title']).content).toBe('Plain title');
	});

	it('falls back without partial insertion if a mapping throws', async () => {
		const session = await setup(node_selection, {
			blocks: {
				p: config.blocks!.p,
				h1: () => {
					throw new Error('Invalid mapping');
				}
			}
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await paste('<p>First</p><h1>Second</h1>', 'Fallback');
			const body = session.get(['page_1', 'body']);
			expect(body.nodes).toHaveLength(4);
			expect(session.get(body.nodes[3]).content.content).toBe('Fallback');
		} finally {
			warn.mockRestore();
		}
	});
});
