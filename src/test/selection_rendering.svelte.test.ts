/**
 * Coverage for how selections render without restyling the whole document.
 *
 * - Nodes inside a node selection carry `data-selected`, and the native
 *   highlight of a node selection is hidden there and in gap selectables,
 *   the only content the selection spans, instead of everywhere.
 * - The canvas's own caret color follows the selection type (iOS Safari
 *   uses it), while the canvas's children keep theirs, so a change of the
 *   selection type restyles the canvas alone.
 * - The native selection is parked on the canvas while DOM holding it is
 *   removed, and rendered again afterwards.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import {
	settle,
	make_mixed_session,
	make_paragraph_session,
	make_story_session
} from './test_utils.js';

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
// The node selection highlight is hidden on devices with a fine pointer
// and support for anchor positioning
const hides_node_highlight =
	!matchMedia('(pointer: coarse)').matches && CSS.supports('anchor-name', '--test');

const node_el = (container: HTMLElement, index: number) =>
	container.querySelector(`[data-path="page_1__body__${index}"][data-type="node"]`);
const text_el = (container: HTMLElement, index: number) =>
	container.querySelector(`[data-path="page_1__body__${index}__content"][data-type="text"]`)!;
const gap_selectable = (container: HTMLElement, offset: number) =>
	container.querySelector(
		`[data-gap-array-path="page_1__body"][data-gap-offset="${offset}"] .svedit-selectable`
	)!;
const selected_paths = (container: HTMLElement) =>
	[...container.querySelectorAll<HTMLElement>('[data-selected]')].map((el) => el.dataset.path);

/** The gap offset holding a DOM selection endpoint. */
const gap_offset_of = (node: Node | null) =>
	(node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('[data-gap-offset]')
		?.dataset.gapOffset;

describe('Selection rendering', () => {
	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('marks exactly the nodes inside a node selection', async () => {
		const session = make_paragraph_session(10);
		const { container } = await render(SveditTest, { session });
		await settle();

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 5,
			focus_offset: 2
		};
		await settle();
		expect(selected_paths(container)).toEqual([
			'page_1__body__2',
			'page_1__body__3',
			'page_1__body__4'
		]);

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 3,
			focus_offset: 3
		};
		await settle();
		expect(selected_paths(container)).toEqual([]);

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		await settle();
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 1, 'content'],
			anchor_offset: 0,
			focus_offset: 4
		};
		await settle();
		expect(selected_paths(container)).toEqual([]);
	});

	it('marks nodes selected in a nested node array', async () => {
		const session = make_story_session(3);
		const { container } = await render(SveditTest, { session });
		await settle();

		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: 0,
			focus_offset: 2
		};
		await settle();
		expect(selected_paths(container)).toEqual([
			'page_1__body__0__buttons__0',
			'page_1__body__0__buttons__1'
		]);
	});

	it('marks only the selected occurrence of a node referenced twice in an array', async () => {
		const session = make_paragraph_session(3);
		const tr = session.tr;
		tr.set(['page_1', 'body'], { nodes: ['p_0', 'p_1', 'p_0'], marks: [], annotations: [] });
		session.apply(tr);
		const { container } = await render(SveditTest, { session });
		await settle();

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 2,
			focus_offset: 3
		};
		await settle();
		expect(selected_paths(container)).toEqual(['page_1__body__2']);
	});

	it('marks only the selected instance of a node shared by two node arrays', async () => {
		// The stories s_2 and s_5 share the button b_2_0
		const session = make_mixed_session(6);
		const tr = session.tr;
		tr.set(['s_5', 'buttons'], { nodes: ['b_2_0', 'b_5_1'], marks: [], annotations: [] });
		session.apply(tr);
		const { container } = await render(SveditTest, { session });
		await settle();

		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 5, 'buttons'],
			anchor_offset: 0,
			focus_offset: 1
		};
		await settle();
		expect(selected_paths(container)).toEqual(['page_1__body__5__buttons__0']);
	});

	it('changes the caret color of the canvas alone when the selection type changes', async () => {
		const session = make_paragraph_session(10);
		const { container } = await render(SveditTest, { session });
		await settle();
		const canvas = container.querySelector<HTMLElement>('.svedit-canvas')!;
		const content = canvas.firstElementChild!;
		const caret = (el: Element) => getComputedStyle(el).caretColor;

		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 1, 'content'],
			anchor_offset: 2,
			focus_offset: 2
		};
		await settle();
		const editing = caret(canvas);
		expect(editing).not.toBe(TRANSPARENT);
		expect(caret(content)).toBe(editing);
		expect(caret(text_el(container, 1))).toBe(editing);

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 2,
			focus_offset: 2
		};
		await settle();
		expect(caret(canvas)).toBe(TRANSPARENT);
		expect(caret(content)).toBe(editing);
		// Wherever the caret can be in a node selection, it is hidden
		expect(caret(gap_selectable(container, 2))).toBe(TRANSPARENT);
		expect(caret(text_el(container, 1))).toBe(TRANSPARENT);
	});

	it.runIf(hides_node_highlight)(
		'hides the native highlight of a node selection on the content it spans',
		async () => {
			const session = make_paragraph_session(10);
			const { container } = await render(SveditTest, { session });
			await settle();
			const highlight = (el: Element) => getComputedStyle(el, '::selection').backgroundColor;
			const visible = highlight(text_el(container, 5));
			expect(visible).not.toBe(TRANSPARENT);

			session.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 2,
				focus_offset: 4
			};
			await settle();
			expect(highlight(text_el(container, 2))).toBe(TRANSPARENT);
			expect(highlight(text_el(container, 3))).toBe(TRANSPARENT);
			expect(highlight(gap_selectable(container, 3))).toBe(TRANSPARENT);
			expect(highlight(gap_selectable(container, 3).querySelector('br')!)).toBe(TRANSPARENT);
			// Text selections keep their highlight
			expect(highlight(text_el(container, 5))).toBe(visible);
		}
	);

	it('renders the node selection again after undoing and redoing an insertion', async () => {
		const session = make_paragraph_session(10);
		const { container } = await render(SveditTest, { session });
		container.querySelector<HTMLElement>('.svedit-canvas')!.focus();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 3,
			focus_offset: 3
		};
		await settle();

		const tr = session.tr;
		const ids = [0, 1, 2].map((i) => {
			const id = `inserted_${i}`;
			tr.create({ id, type: 'paragraph', content: { content: id, marks: [], annotations: [] } });
			return id;
		});
		tr.insert_nodes(ids);
		session.apply(tr);
		await settle();
		const dom_selection = window.getSelection()!;
		expect([
			gap_offset_of(dom_selection.anchorNode),
			gap_offset_of(dom_selection.focusNode)
		]).toEqual(['3', '6']);

		// Undo removes the nodes holding the native selection
		session.undo();
		await settle();
		expect(session.get(['page_1', 'body']).nodes).toHaveLength(10);
		expect([
			gap_offset_of(dom_selection.anchorNode),
			gap_offset_of(dom_selection.focusNode)
		]).toEqual(['3', '3']);

		session.redo();
		await settle();
		expect([
			gap_offset_of(dom_selection.anchorNode),
			gap_offset_of(dom_selection.focusNode)
		]).toEqual(['3', '6']);
		expect(node_el(container, 4)?.hasAttribute('data-selected')).toBe(true);
	});

	it('renders the text caret again after undoing a split', async () => {
		const session = make_paragraph_session(10);
		const { container } = await render(SveditTest, { session });
		container.querySelector<HTMLElement>('.svedit-canvas')!.focus();
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 5, 'content'],
			anchor_offset: 4,
			focus_offset: 4
		};
		await settle();

		session.commands.break_text_node.execute();
		await settle();
		expect(session.selection?.path).toEqual(['page_1', 'body', 6, 'content']);

		// Undo removes the new node, which holds the native selection
		session.undo();
		await settle();
		const dom_selection = window.getSelection()!;
		const text =
			dom_selection.anchorNode!.parentElement!.closest<HTMLElement>('[data-type="text"]');
		expect(text?.dataset.path).toBe('page_1__body__5__content');
		expect(dom_selection.anchorOffset).toBe(4);
		expect(dom_selection.isCollapsed).toBe(true);
	});
});
