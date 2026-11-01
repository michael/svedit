/**
 * Coverage for anchor names and gap positioning in long documents.
 *
 * Every `anchor-name` costs the browser work on each layout pass, so nodes
 * and their properties only carry theirs while near the viewport, while
 * they hold, contain or surround the selection, or as one of the first two
 * nodes of their array. Gaps far from the viewport have no anchor
 * references. Inserting or deleting nodes moves the visibility
 * registrations of the shifted nodes, which must keep their near state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import { settle, make_paragraph_session } from './test_utils.js';

const COUNT = 80;
const settle_scroll = () => settle({ rafs: 8, ms: 200 });

const has_anchor = (el: Element | null) =>
	/anchor-name:\s*--/.test(el?.getAttribute('style') ?? '');
const node_el = (container: HTMLElement, index: number) =>
	container.querySelector(`[data-path="page_1__body__${index}"][data-type="node"]`);
const text_el = (container: HTMLElement, index: number) =>
	container.querySelector(`[data-path="page_1__body__${index}__content"][data-type="text"]`);
const gap_el = (container: HTMLElement, offset: number) =>
	container.querySelector(
		`.node-gap[data-gap-array-path="page_1__body"][data-gap-offset="${offset}"]`
	);

/** Whether an element is in view, or clearly far from it (overscan is 500px). */
function in_view(el: Element | null) {
	const rect = el!.getBoundingClientRect();
	return rect.bottom > 0 && rect.top < window.innerHeight;
}
function far(el: Element | null) {
	const rect = el!.getBoundingClientRect();
	return rect.bottom < -700 || rect.top > window.innerHeight + 700;
}

/** Indexes of the body nodes currently in view. */
function nodes_in_view(container: HTMLElement) {
	const count = container.querySelectorAll(
		'[data-path^="page_1__body__"][data-type="node"]'
	).length;
	return Array.from({ length: count }, (_, i) => i).filter((i) => in_view(node_el(container, i)));
}

/** Nodes in view carry anchor names, and the gaps between them are positioned. */
function expect_near_state(container: HTMLElement) {
	const visible = nodes_in_view(container);
	expect(visible.length).toBeGreaterThan(1);
	for (const i of visible) {
		expect(has_anchor(node_el(container, i)), `node ${i}`).toBe(true);
		expect(has_anchor(text_el(container, i)), `text ${i}`).toBe(true);
	}
	for (const i of visible.slice(1)) {
		expect(gap_el(container, i)?.classList.contains('positioned'), `gap ${i}`).toBe(true);
	}
}

function insert_paragraph(session: ReturnType<typeof make_paragraph_session>, index: number) {
	const tr = session.tr;
	const id = tr.generate_id();
	tr.create({ id, type: 'paragraph', content: { content: 'New', marks: [], annotations: [] } });
	tr.set_selection({
		type: 'node',
		path: ['page_1', 'body'],
		anchor_offset: index,
		focus_offset: index
	});
	tr.insert_nodes([id]);
	session.apply(tr);
}

describe('Anchor names', () => {
	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('are only carried by nodes near the viewport', async () => {
		const session = make_paragraph_session(COUNT);
		const { container } = await render(SveditTest, { session });
		await settle_scroll();

		expect_near_state(container);
		const last = COUNT - 1;
		expect(far(node_el(container, last))).toBe(true);
		expect(has_anchor(node_el(container, last))).toBe(false);
		expect(has_anchor(text_el(container, last))).toBe(false);
		// Gaps far from the viewport have no anchor references
		expect(gap_el(container, last)?.classList.contains('positioned')).toBe(false);
		expect(gap_el(container, last)?.hasAttribute('style')).toBe(false);
	});

	it('follow the viewport while scrolling, except for the first two nodes', async () => {
		const session = make_paragraph_session(COUNT);
		const { container } = await render(SveditTest, { session });
		await settle_scroll();

		window.scrollTo(0, document.documentElement.scrollHeight);
		await settle_scroll();

		expect_near_state(container);
		expect(has_anchor(node_el(container, COUNT - 1))).toBe(true);
		expect(far(node_el(container, 5))).toBe(true);
		expect(has_anchor(node_el(container, 5))).toBe(false);
		// Gap markers measure row gaps with the first two nodes
		expect(has_anchor(node_el(container, 0))).toBe(true);
		expect(has_anchor(node_el(container, 1))).toBe(true);
	});

	it('stay on the node holding the selection, wherever it is', async () => {
		const session = make_paragraph_session(COUNT);
		const { container } = await render(SveditTest, { session });
		await settle_scroll();

		// The canvas is not focused, so the selection doesn't scroll into view
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 75, 'content'],
			anchor_offset: 2,
			focus_offset: 2
		};
		await settle();

		expect(far(node_el(container, 75))).toBe(true);
		expect(has_anchor(node_el(container, 75))).toBe(true);
		expect(has_anchor(text_el(container, 75))).toBe(true);
		expect(has_anchor(node_el(container, 76))).toBe(false);

		session.selection = null;
		await settle();
		expect(has_anchor(node_el(container, 75))).toBe(false);
	});

	it('stay on selected nodes and the nodes around them', async () => {
		const session = make_paragraph_session(COUNT);
		const { container } = await render(SveditTest, { session });
		await settle_scroll();

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 70,
			focus_offset: 72
		};
		await settle();

		for (const i of [69, 70, 71, 72])
			expect(has_anchor(node_el(container, i)), `node ${i}`).toBe(true);
		for (const i of [68, 73]) expect(has_anchor(node_el(container, i)), `node ${i}`).toBe(false);
	});

	it('keep their near state when nodes are inserted above them', async () => {
		const session = make_paragraph_session(COUNT);
		const { container } = await render(SveditTest, { session });
		await settle_scroll();

		for (let i = 0; i < 3; i++) {
			insert_paragraph(session, 2);
			await settle({ rafs: 1, ms: 0 });
		}
		session.selection = null;
		await settle_scroll();

		expect_near_state(container);
		expect(has_anchor(node_el(container, COUNT + 2))).toBe(false);
	});

	it('keep their near state when nodes are split above them', async () => {
		const session = make_paragraph_session(COUNT);
		const { container } = await render(SveditTest, { session });
		await settle_scroll();

		// Each split inserts a node whose element registers before the
		// element it displaced has moved on
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 1, 'content'],
			anchor_offset: 10,
			focus_offset: 10
		};
		for (let i = 0; i < 4; i++) {
			session.commands.break_text_node.execute();
			await settle({ rafs: 1, ms: 0 });
		}
		session.selection = null;
		await settle_scroll();

		expect_near_state(container);
	});

	it('keep their near state when nodes above them are deleted', async () => {
		const session = make_paragraph_session(COUNT);
		const { container } = await render(SveditTest, { session });
		await settle_scroll();

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 3
		};
		session.apply(session.tr.delete_selection());
		await settle();
		session.undo();
		await settle();
		session.redo();
		session.selection = null;
		await settle_scroll();

		expect_near_state(container);
		expect(has_anchor(node_el(container, COUNT - 4))).toBe(false);
	});

	it('are carried by every node when visibility culling is disabled', async () => {
		const session = make_paragraph_session(COUNT, { visibility_culling: false });
		const { container } = await render(SveditTest, { session });
		await settle_scroll();

		const last = COUNT - 1;
		expect(far(node_el(container, last))).toBe(true);
		expect(has_anchor(node_el(container, last))).toBe(true);
		expect(has_anchor(text_el(container, last))).toBe(true);
		expect(gap_el(container, last)?.classList.contains('positioned')).toBe(true);
	});
});
