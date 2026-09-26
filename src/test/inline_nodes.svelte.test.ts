import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import {
	validate_document_schema,
	validate_document,
	validate_config_components
} from '../lib/doc_utils.js';
import { INLINE_NODE_PLACEHOLDER, get_dom_model_text } from '../lib/utils.js';
import create_inline_session from './create_inline_session.js';

const description_path = ['story_1', 'description'];
/**
 * The same property reached through the rendered document tree. Rendering
 * tests must select through this path: `__render_text_selection` looks the
 * element up by `data-path`, so a canonical path that is never rendered
 * finds nothing.
 */
const rendered_path = ['page_1', 'body', 0, 'description'];

/** A document node graph carrying one mention in the story description. */
function doc_with_mention(start_offset: number, end_offset: number) {
	return {
		document_id: 'page_1',
		nodes: {
			mention_1: { id: 'mention_1', type: 'mention', user_id: 'johannes' },
			story_1: {
				id: 'story_1',
				type: 'story',
				layout: 'image-left',
				image: '',
				title: { content: 'First story', marks: [], annotations: [] },
				buttons: { nodes: [], marks: [], annotations: [] },
				description: {
					content: `Hi ${INLINE_NODE_PLACEHOLDER} there`,
					marks: [{ start_offset, end_offset, node_id: 'mention_1' }],
					annotations: []
				}
			},
			page_1: {
				id: 'page_1',
				type: 'page',
				body: { nodes: ['story_1'], marks: [], annotations: [] },
				keywords: [],
				daily_visitors: [],
				created_at: '2026-08-22T00:00:00.000Z'
			}
		}
	};
}

describe('inline node schema validation', () => {
	it('exposes a single-character placeholder', () => {
		expect(INLINE_NODE_PLACEHOLDER).toBe('￼');
		expect(INLINE_NODE_PLACEHOLDER.length).toBe(1);
	});

	it('accepts inline_types referencing a node type of kind inline', () => {
		const session = create_inline_session();
		expect(() => validate_document_schema(session.schema)).not.toThrow();
	});

	it('rejects inline_types referencing a type that is not of kind inline', () => {
		const session = create_inline_session();
		(session.schema.story.properties.description as any).inline_types = ['strong'];
		expect(() => validate_document_schema(session.schema)).toThrow(/kind 'inline'/);
	});

	it('rejects inline_types on a node_array property', () => {
		const session = create_inline_session();
		(session.schema.page.properties.body as any).inline_types = ['mention'];
		expect(() => validate_document_schema(session.schema)).toThrow(/only supported in text/);
	});

	it('accepts a mention spanning exactly one character', () => {
		const session = create_inline_session();
		expect(() => validate_document(doc_with_mention(3, 4) as any, session.schema)).not.toThrow();
	});

	it('rejects a mention spanning more than one character', () => {
		const session = create_inline_session();
		expect(() => validate_document(doc_with_mention(3, 5) as any, session.schema)).toThrow(
			/exactly one character/
		);
	});

	it('does not narrow which marks are allowed when inline_types is added', () => {
		const session = create_inline_session();
		// A property with no mark_types accepts any mark; declaring inline_types
		// must not silently turn that into "inline nodes only".
		delete (session.schema.story.properties.description as any).mark_types;
		const doc = doc_with_mention(3, 4) as any;
		doc.nodes.strong_1 = { id: 'strong_1', type: 'strong' };
		doc.nodes.story_1.description.marks.push({
			start_offset: 0,
			end_offset: 2,
			node_id: 'strong_1'
		});
		expect(() => validate_document(doc, session.schema)).not.toThrow();
	});

	it('rejects an inline node type with no registered component', () => {
		const session = create_inline_session();
		delete session.config.node_components.mention;
		// Session's constructor calls this; calling it directly keeps the test
		// independent of the constructor's argument order.
		expect(() => validate_config_components(session.schema, session.config)).toThrow(
			/must have a registered component/
		);
	});
});

describe('insert_inline_node', () => {
	function select(session: any, anchor_offset: number, focus_offset: number) {
		session.selection = {
			type: 'text',
			path: description_path,
			anchor_offset,
			focus_offset
		};
	}

	it('inserts a placeholder, a one-character mark and leaves the caret after it', () => {
		const session = create_inline_session();
		select(session, 5, 5);
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));

		const value = session.get(description_path);
		expect(value.content.slice(5, 6)).toBe(INLINE_NODE_PLACEHOLDER);
		expect(value.marks).toHaveLength(1);
		expect(value.marks[0].start_offset).toBe(5);
		expect(value.marks[0].end_offset).toBe(6);
		expect(session.get(value.marks[0].node_id).user_id).toBe('johannes');
		expect(session.selection).toMatchObject({ anchor_offset: 6, focus_offset: 6 });
	});

	it('replaces a non-collapsed selection', () => {
		const session = create_inline_session();
		const original = session.get(description_path).content;
		select(session, 0, 5);
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));

		const value = session.get(description_path);
		expect(value.content).toBe(INLINE_NODE_PLACEHOLDER + original.slice(5));
		expect(value.marks[0]).toMatchObject({ start_offset: 0, end_offset: 1 });
	});

	it('refuses an inline type that is not declared on the property', () => {
		const session = create_inline_session();
		select(session, 5, 5);
		session.apply(session.tr.insert_inline_node('ticker', { symbol: 'AAPL' }));
		expect(session.get(description_path).marks).toHaveLength(0);
	});

	it('refuses to insert inside an existing mark', () => {
		const session = create_inline_session();
		select(session, 0, 10);
		session.apply(session.tr.toggle_mark('strong'));
		select(session, 5, 5);
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));

		const value = session.get(description_path);
		expect(value.marks).toHaveLength(1);
		expect(session.get(value.marks[0].node_id).type).toBe('strong');
	});

	it('does not delete the selection when it refuses to insert', () => {
		const session = create_inline_session();
		select(session, 0, 10);
		session.apply(session.tr.toggle_mark('strong'));
		const content_before = session.get(description_path).content;

		// Strictly inside the mark: the insert must be refused, and refusing
		// must not destroy the selected text on the way out.
		select(session, 3, 6);
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));

		const value = session.get(description_path);
		expect(value.content).toBe(content_before);
		expect(value.marks).toHaveLength(1);
		expect(session.get(value.marks[0].node_id).type).toBe('strong');
	});

	it('replaces a selection that exactly covers a mark', () => {
		const session = create_inline_session();
		select(session, 0, 10);
		session.apply(session.tr.toggle_mark('strong'));

		// The mark is consumed by the deletion, so nothing contains the caret
		// afterwards and the insert is legal.
		select(session, 0, 10);
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));

		const value = session.get(description_path);
		expect(value.marks).toHaveLength(1);
		expect(session.get(value.marks[0].node_id).type).toBe('mention');
	});

	it('keeps the attachment on the right character when typing around it', () => {
		const session = create_inline_session();
		select(session, 5, 5);
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));

		// Typing before it shifts the attachment along.
		select(session, 0, 0);
		session.apply(session.tr.insert_text('ab'));
		expect(session.get(description_path).marks[0]).toMatchObject({
			start_offset: 7,
			end_offset: 8
		});

		// Typing at its trailing edge stays outside it.
		select(session, 8, 8);
		session.apply(session.tr.insert_text('cd'));
		expect(session.get(description_path).marks[0]).toMatchObject({
			start_offset: 7,
			end_offset: 8
		});
	});

	it('deletes the payload node when its character is deleted', () => {
		const session = create_inline_session();
		select(session, 5, 5);
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));
		const mention_id = session.get(description_path).marks[0].node_id;

		select(session, 6, 6);
		session.apply(session.tr.delete_selection('backward'));

		expect(session.get(description_path).marks).toHaveLength(0);
		expect(session.get(mention_id)).toBeUndefined();
	});

	it('reports available inline types for the current selection', () => {
		const session = create_inline_session();
		select(session, 5, 5);
		expect(session.available_inline_types).toEqual(['mention']);
		session.selection = {
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 0,
			focus_offset: 0
		};
		expect(session.available_inline_types).toEqual([]);
	});
});

describe('inline node rendering', () => {
	/** The story description as rendered inside page_1.body[0]. */
	const rendered_description_path = 'page_1__body__0__description';

	async function render_with_mention() {
		const session = create_inline_session();
		session.selection = {
			type: 'text',
			path: rendered_path,
			anchor_offset: 5,
			focus_offset: 5
		};
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));
		const { container } = render(SveditTest, { session });
		await tick();
		return { session, container };
	}

	it('renders an atomic wrapper and omits the placeholder character', async () => {
		const { container } = await render_with_mention();
		const text_el = container.querySelector<HTMLElement>(
			`[data-path="${rendered_description_path}"][data-type="text"]`
		);
		expect(text_el).not.toBeNull();

		const inline_el = text_el!.querySelector<HTMLElement>('[data-type="inline-node"]');
		expect(inline_el).not.toBeNull();
		expect(inline_el!.getAttribute('contenteditable')).toBe('false');
		expect(inline_el!.dataset.offset).toBe('5');
		expect(inline_el!.textContent).toBe('@johannes');

		// The placeholder is a model-only character; it must never reach the DOM.
		expect(text_el!.textContent).not.toContain(INLINE_NODE_PLACEHOLDER);
	});

	it('marks the wrapper as selected when the selection covers it', async () => {
		const { session, container } = await render_with_mention();
		const inline_el = () => container.querySelector<HTMLElement>('[data-type="inline-node"]')!;

		expect(inline_el().classList.contains('selected')).toBe(false);

		// Selection matching is path-based, exactly as `is_focused` already is,
		// so the *rendered* path is what marks this instance selected. story_1
		// is rendered twice in the test document, at body 0 and body 1.
		session.selection = {
			type: 'text',
			path: rendered_path,
			anchor_offset: 5,
			focus_offset: 6
		};
		await tick();
		expect(inline_el().classList.contains('selected')).toBe(true);
	});
});

describe('selection mapping, DOM to model', () => {
	const rendered_description_path = ['page_1', 'body', 0, 'description'];
	const text_selector = '[data-type="text"][data-path="page_1__body__0__description"]';

	async function render_and_focus(with_mention: boolean) {
		const session = create_inline_session();
		if (with_mention) {
			session.selection = {
				type: 'text',
				path: rendered_path,
				anchor_offset: 5,
				focus_offset: 5
			};
			session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));
		}
		const { container } = render(SveditTest, { session });
		await tick();
		const canvas = container.querySelector<HTMLElement>('.svedit-canvas')!;
		canvas.focus();
		// The test window never holds OS focus, so Chrome does not deliver the
		// focus event. Dispatch it so canvas_focused flips as it would for a
		// real user — without this onselectionchange bails at its guard.
		canvas.dispatchEvent(new FocusEvent('focus'));
		await tick();
		return { session, container };
	}

	/** Places a DOM selection and lets Svedit map it back into the model. */
	async function set_dom_selection(
		start_container: Node,
		start_offset: number,
		end_container: Node,
		end_offset: number
	) {
		const range = document.createRange();
		range.setStart(start_container, start_offset);
		range.setEnd(end_container, end_offset);
		window.getSelection()?.removeAllRanges();
		window.getSelection()?.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	function inline_position(container: HTMLElement) {
		const text_el = container.querySelector<HTMLElement>(text_selector)!;
		const inline_el = text_el.querySelector<HTMLElement>('[data-type="inline-node"]')!;
		const parent = inline_el.parentNode!;
		const index = Array.prototype.indexOf.call(parent.childNodes, inline_el);
		return { text_el, inline_el, parent, index };
	}

	it('counts an inline node as one character, not as its rendered text', async () => {
		const { session, container } = await render_and_focus(true);
		const { parent, index } = inline_position(container);

		// A caret immediately after the chip. The chip renders '@johannes'
		// (9 characters) but occupies exactly 1 in the model, so without the
		// correction this would map to offset 14 instead of 6.
		await set_dom_selection(parent, index + 1, parent, index + 1);

		expect(session.selection).toMatchObject({
			type: 'text',
			path: rendered_description_path,
			anchor_offset: 6,
			focus_offset: 6
		});
	});

	it('maps a caret placed before the inline node', async () => {
		const { session, container } = await render_and_focus(true);
		const { parent, index } = inline_position(container);

		await set_dom_selection(parent, index, parent, index);

		expect(session.selection).toMatchObject({ anchor_offset: 5, focus_offset: 5 });
	});

	it('maps a selection spanning the inline node', async () => {
		const { session, container } = await render_and_focus(true);
		const { parent, index } = inline_position(container);

		await set_dom_selection(parent, index, parent, index + 1);

		expect(session.selection).toMatchObject({ anchor_offset: 5, focus_offset: 6 });
	});

	it('snaps a boundary that lands inside the inline node', async () => {
		const { session, container } = await render_and_focus(true);
		const { inline_el } = inline_position(container);
		const chip_text = inline_el.querySelector('.chip')!.firstChild!;

		// Browsers can drop a boundary inside a contenteditable=false subtree.
		// The model has no positions in there, so it must snap to an edge.
		await set_dom_selection(chip_text, 3, chip_text, 3);

		expect(session.selection).toMatchObject({ anchor_offset: 6, focus_offset: 6 });
	});

	it('maps text with no inline nodes exactly as before', async () => {
		const { session, container } = await render_and_focus(false);
		const text_el = container.querySelector<HTMLElement>(text_selector)!;
		const walker = document.createTreeWalker(text_el, NodeFilter.SHOW_TEXT);
		const text_node = walker.nextNode()!;

		await set_dom_selection(text_node, 3, text_node, 8);

		expect(session.selection).toMatchObject({ anchor_offset: 3, focus_offset: 8 });
	});
});

describe('selection mapping, model to DOM', () => {
	async function render_with_mention() {
		const session = create_inline_session();
		session.selection = {
			type: 'text',
			path: rendered_path,
			anchor_offset: 5,
			focus_offset: 5
		};
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));
		const { container } = render(SveditTest, { session });
		await tick();
		const canvas = container.querySelector<HTMLElement>('.svedit-canvas')!;
		canvas.focus();
		// The test window never holds OS focus, so Chrome does not deliver the
		// focus event. Dispatch it so canvas_focused flips as it would for a
		// real user — without this onselectionchange bails at its guard.
		canvas.dispatchEvent(new FocusEvent('focus'));
		await tick();
		return { session, container };
	}

	async function apply_selection(session: any, anchor_offset: number, focus_offset: number) {
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'description'],
			anchor_offset,
			focus_offset
		};
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	it('renders a selection covering the inline node', async () => {
		const { session, container } = await render_with_mention();
		await apply_selection(session, 5, 6);

		const dom_selection = window.getSelection()!;
		expect(dom_selection.isCollapsed).toBe(false);

		// The DOM range must wrap the whole wrapper element. Note we cannot
		// assert on dom_selection.toString(): Chrome excludes user-select:none
		// subtrees from a selection's string, so the chip contributes nothing
		// to it. That is also why TextProperty passes a `selected` prop —
		// the native selection paint never reaches the chip.
		const inline_el = container.querySelector<HTMLElement>('[data-type="inline-node"]')!;
		const dom_range = dom_selection.getRangeAt(0);
		expect(dom_range.intersectsNode(inline_el)).toBe(true);

		// Containment, not exact equality: at a seam the preceding text node
		// claims the boundary first, so the range starts at the end of that
		// text node rather than at (parent, index). Those are adjacent
		// positions, and a caret inside text behaves better than one between
		// elements, so this is intended.
		const wrapping = document.createRange();
		wrapping.selectNode(inline_el);
		expect(dom_range.compareBoundaryPoints(Range.START_TO_START, wrapping)).toBeLessThanOrEqual(0);
		expect(dom_range.compareBoundaryPoints(Range.END_TO_END, wrapping)).toBeGreaterThanOrEqual(0);
	});

	it('renders a caret at the trailing edge of the inline node', async () => {
		const { session } = await render_with_mention();
		await apply_selection(session, 6, 6);

		const dom_selection = window.getSelection()!;
		expect(dom_selection.isCollapsed).toBe(true);
		expect(dom_selection.type).toBe('Caret');
	});

	it('round-trips a selection that spans the inline node and text', async () => {
		const { session } = await render_with_mention();
		await apply_selection(session, 3, 8);

		// Re-derive the model selection from what was just rendered.
		document.dispatchEvent(new Event('selectionchange'));
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(session.selection).toMatchObject({ anchor_offset: 3, focus_offset: 8 });
	});
});

describe('clicking an inline node', () => {
	it('selects its single character so selected_marks reports it', async () => {
		const session = create_inline_session();
		session.selection = {
			type: 'text',
			path: rendered_path,
			anchor_offset: 5,
			focus_offset: 5
		};
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));
		const { container } = render(SveditTest, { session });
		await tick();

		const inline_el = container.querySelector<HTMLElement>('[data-type="inline-node"]')!;
		inline_el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
		await tick();

		expect(session.selection).toMatchObject({
			type: 'text',
			path: ['page_1', 'body', 0, 'description'],
			anchor_offset: 5,
			focus_offset: 6
		});
		expect(session.selected_marks).toHaveLength(1);
		expect(session.selected_marks[0].node.type).toBe('mention');
	});
});

describe('clipboard export', () => {
	it('strips the placeholder from plain text but keeps it in the model', () => {
		const session = create_inline_session();
		session.selection = {
			type: 'text',
			path: description_path,
			anchor_offset: 5,
			focus_offset: 5
		};
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));

		session.selection = {
			type: 'text',
			path: description_path,
			anchor_offset: 0,
			focus_offset: 10
		};

		// The model keeps the placeholder: it is what makes the node atomic.
		expect(session.get_selected_text().content).toContain(INLINE_NODE_PLACEHOLDER);
		// External plain text must not carry a replacement box.
		expect(session.get_selected_plain_text()).not.toContain(INLINE_NODE_PLACEHOLDER);
	});

	it('round-trips an inline node through an internal copy and paste', () => {
		const session = create_inline_session();
		session.selection = {
			type: 'text',
			path: description_path,
			anchor_offset: 5,
			focus_offset: 5
		};
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));

		session.selection = {
			type: 'text',
			path: description_path,
			anchor_offset: 5,
			focus_offset: 6
		};
		const copied = session.get_selected_text();

		session.selection = {
			type: 'text',
			path: description_path,
			anchor_offset: 0,
			focus_offset: 0
		};
		session.apply(
			session.tr.insert_text(copied.content, copied.marks, copied.annotations, copied.nodes)
		);

		const value = session.get(description_path);
		expect(value.marks).toHaveLength(2);
		const pasted = value.marks.find((mark: any) => mark.start_offset === 0);
		expect(session.get(pasted.node_id).type).toBe('mention');
		expect(session.get(pasted.node_id).user_id).toBe('johannes');
	});
});

describe('pasting an inline node where it is not allowed', () => {
	/** Copies a single mention out of the story description. */
	function copy_a_mention(session: any) {
		session.selection = {
			type: 'text',
			path: description_path,
			anchor_offset: 5,
			focus_offset: 5
		};
		session.apply(session.tr.insert_inline_node('mention', { user_id: 'johannes' }));
		session.selection = {
			type: 'text',
			path: description_path,
			anchor_offset: 5,
			focus_offset: 6
		};
		return session.get_selected_text();
	}

	it('drops the placeholder when the target property does not allow the type', () => {
		const session = create_inline_session();
		(session.schema.story.properties.title as any).mark_types = ['strong'];
		const copied = copy_a_mention(session);

		session.selection = {
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 0,
			focus_offset: 0
		};
		session.apply(
			session.tr.insert_text(copied.content, copied.marks, copied.annotations, copied.nodes)
		);

		const title = session.get(['story_1', 'title']);
		// No attachment could be restored, so no orphaned placeholder may remain.
		expect(title.content).not.toContain(INLINE_NODE_PLACEHOLDER);
		expect(title.marks).toHaveLength(0);
	});

	it('drops the placeholder when the attachment would land inside a mark', () => {
		const session = create_inline_session();
		const copied = copy_a_mention(session);

		// Bold a run, then paste the mention into the middle of it.
		session.selection = {
			type: 'text',
			path: description_path,
			anchor_offset: 0,
			focus_offset: 4
		};
		session.apply(session.tr.toggle_mark('strong'));
		session.selection = {
			type: 'text',
			path: description_path,
			anchor_offset: 2,
			focus_offset: 2
		};
		session.apply(
			session.tr.insert_text(copied.content, copied.marks, copied.annotations, copied.nodes)
		);

		const value = session.get(description_path);
		const placeholders = [...value.content].filter(
			(character) => character === INLINE_NODE_PLACEHOLDER
		);
		// Only the original mention's placeholder survives; the pasted one had
		// no attachment restored and must not linger.
		expect(placeholders).toHaveLength(1);
		expect(
			value.marks.filter((mark: any) => session.get(mark.node_id).type === 'mention')
		).toHaveLength(1);
	});
});

describe('reading DOM text as the model expresses it', () => {
	it('counts an inline node as one placeholder character', () => {
		const container = document.createElement('div');
		const before = document.createTextNode('Ask ');
		const inline_el = document.createElement('span');
		inline_el.dataset.type = 'inline-node';
		inline_el.innerHTML = '<span class="chip">@Johannes</span>';
		const after = document.createTextNode(' now');
		container.append(before, inline_el, after, document.createElement('br'));

		// Raw textContent would read '@Johannes' here, which can never equal the
		// model text and would defeat the composition cleanup's early return.
		expect(container.textContent).toContain('@Johannes');
		expect(get_dom_model_text(container)).toBe(`Ask ${INLINE_NODE_PLACEHOLDER} now`);
	});

	it('matches the model text for a property containing an inline node', () => {
		const container = document.createElement('div');
		const inline_el = document.createElement('span');
		inline_el.dataset.type = 'inline-node';
		inline_el.textContent = '@Johannes';
		container.append(document.createTextNode('Hi '), inline_el);

		const model_text = `Hi ${INLINE_NODE_PLACEHOLDER}`;
		expect(get_dom_model_text(container)).toBe(model_text);
	});
});
