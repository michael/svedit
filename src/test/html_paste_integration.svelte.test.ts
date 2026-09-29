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
