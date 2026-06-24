/**
 * Regression coverage for node-selection scroll-into-view and trailing-
 * gap visibility across insert / delete cycles.
 *
 * Bugs these cover:
 *
 * 1. Insert at the trailing gap of a horizontally-overflowing array
 *    didn't scroll the array to expose the new node + cursor. Root
 *    cause: render_selection's skip condition matched after the insert
 *    because Svelte reuses the trailing-gap DOM element with a shifted
 *    `data-gap-offset`, so __get_node_selection_from_dom() reads back
 *    the new offset and the JSON compare against the new model passed.
 *
 * 2. After add-then-delete back to a non-overflowing state, the
 *    trailing `.gap-after.last` element lost its `.positioned` class.
 *    Root cause: sync_array_edge_gaps early-exited when edge_map
 *    didn't change, missing the case where the trailing-gap DOM
 *    element was reused with a different anchor relationship after a
 *    structural mutation.
 *
 * 3. Insert at the trailing gap of an image grid (wrap-flow array
 *    that isn't its own scroll container — the document scrolls
 *    instead) didn't bring the new node into view. Root cause: a
 *    "set scrollLeft/Top to max" alone is a no-op when the array
 *    itself isn't scrollable; the document needs scrollIntoView on
 *    the last node to scroll.
 *
 * 4. Drag-selecting across nodes scrolled the document on every frame
 *    because render_selection re-ran scrollIntoView while the user was
 *    still dragging. Fix: distinguish DOM-driven updates (onselectionchange)
 *    from model-driven updates (insert / undo) and skip rerender on the
 *    former when the DOM already matches the model.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import {
	settle,
	settle_grid,
	make_story_session,
	make_image_grid_session,
	find_buttons_array,
	find_image_grid_array,
	find_last_gap
} from './test_utils.js';

function insert_button(session) {
	const tr = session.tr;
	session.config.inserters.button(tr);
	session.apply(tr);
}

function insert_image_grid_item(session) {
	const tr = session.tr;
	session.config.inserters.image_grid_item(tr);
	session.apply(tr);
}

function delete_selection(session) {
	const tr = session.tr;
	tr.delete_selection();
	session.apply(tr);
}

describe('node-selection scroll-into-view (row buttons array)', () => {
	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('scrolls the array to its end after inserting at the trailing gap of an overflowing array', async () => {
		const session = make_story_session(20);
		const { container } = render(SveditTest, { session });
		await settle();

		const arr = find_buttons_array(container);
		expect(arr).not.toBeNull();
		expect(arr.scrollWidth).toBeGreaterThan(arr.clientWidth + 100);

		// Start scrolled to max — i.e. the cursor sits on the trailing
		// gap (only visible when the array is at the end).
		arr.scrollLeft = arr.scrollWidth;
		await settle();
		const scroll_before = arr.scrollLeft;

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		canvas.focus();
		const trailing_offset = 20;
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: trailing_offset,
			focus_offset: trailing_offset
		};
		await settle();

		insert_button(session);
		await settle();

		// New button pushes scrollWidth past the old max, and the array
		// rescrolls to the new max so the new node + trailing gap are
		// exposed.
		expect(arr.scrollLeft).toBeGreaterThan(scroll_before);
		const new_max = arr.scrollWidth - arr.clientWidth;
		expect(arr.scrollLeft).toBeGreaterThanOrEqual(new_max - 5);

		const lg = find_last_gap(arr);
		expect(lg).not.toBeNull();
		expect(lg.classList.contains('positioned')).toBe(true);
	});

	it('scrolls the array back to its start when the cursor moves to offset 0', async () => {
		// Covers the leading-cursor branch in __render_node_selection.
		const session = make_story_session(20);
		const { container } = render(SveditTest, { session });
		await settle();

		const arr = find_buttons_array(container);
		expect(arr.scrollWidth).toBeGreaterThan(arr.clientWidth + 100);
		// Start scrolled away from the leading edge.
		arr.scrollLeft = arr.scrollWidth;
		await settle();
		expect(arr.scrollLeft).toBeGreaterThan(0);

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		canvas.focus();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: 0,
			focus_offset: 0
		};
		await settle();

		expect(arr.scrollLeft).toBe(0);
	});

	it('keeps the trailing gap .positioned through a delete-cycle back to non-overflow', async () => {
		const session = make_story_session(20);
		const { container } = render(SveditTest, { session });
		await settle();

		const arr = find_buttons_array(container);
		expect(arr.scrollWidth).toBeGreaterThan(arr.clientWidth + 100);
		arr.scrollLeft = arr.scrollWidth;
		await settle();

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		canvas.focus();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: session.doc.nodes.story_1.buttons.nodes.length,
			focus_offset: session.doc.nodes.story_1.buttons.nodes.length
		};
		await settle();

		let safety = 25;
		while (safety-- > 0) {
			if (arr.scrollWidth <= arr.clientWidth + 5) break;
			if (session.doc.nodes.story_1.buttons.nodes.length <= 1) break;
			delete_selection(session);
			await settle();
		}

		expect(arr.scrollWidth).toBeLessThanOrEqual(arr.clientWidth + 5);
		const lg = find_last_gap(arr);
		expect(lg).not.toBeNull();
		expect(lg.classList.contains('positioned')).toBe(true);
	});
});

describe('node-selection scroll-into-view (wrap-grid image_grid)', () => {
	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('brings the newly-inserted item into the viewport when inserting at the trailing gap of a page-scrolling grid', async () => {
		const session = make_image_grid_session(12);
		const { container } = render(SveditTest, { session });
		await settle_grid();

		const arr = find_image_grid_array(container);
		expect(arr).not.toBeNull();
		const arr_rect = arr.getBoundingClientRect();
		// Sanity: trailing items are below the fold before we insert.
		expect(arr_rect.height).toBeGreaterThan(window.innerHeight - 100);

		window.scrollTo(0, 0);
		await settle_grid();

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		canvas.focus();
		const trailing_offset = 12;
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'image_grid_items'],
			anchor_offset: trailing_offset,
			focus_offset: trailing_offset
		};
		await settle_grid();

		insert_image_grid_item(session);
		await settle_grid();

		const new_item_path = `page_1__body__0__image_grid_items__${trailing_offset}`;
		const new_item = container.querySelector(`[data-path="${new_item_path}"]`);
		expect(new_item).not.toBeNull();

		const r = new_item.getBoundingClientRect();
		const in_viewport = r.bottom > 0 && r.top < window.innerHeight;
		expect(
			in_viewport,
			`new item rect=${JSON.stringify({ t: r.top, b: r.bottom, vh: window.innerHeight })}`
		).toBe(true);
	});
});

describe('node-selection: DOM-driven vs. model-driven', () => {
	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('does not scrollIntoView when a DOM-driven selection change leaves the DOM in sync (drag-loop guard)', async () => {
		// Regression for the drag-loop scroll. During drag the browser
		// updates the DOM selection and onselectionchange echoes it to
		// the model. The DOM already reflects the new selection, so
		// rerunning scrollIntoView is wasted work and (worse) yanks the
		// viewport away while the user is still dragging.
		//
		// The fix: onselectionchange marks the model update as
		// DOM-driven, and render_selection only applies the skip in
		// that case — if the DOM already matches, no rerender.
		const session = make_story_session(20);
		const { container } = render(SveditTest, { session });
		await settle();

		const arr = find_buttons_array(container);
		expect(arr.scrollWidth).toBeGreaterThan(arr.clientWidth + 100);
		arr.scrollLeft = 0;
		await settle();

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		canvas.focus();

		// Simulate the DOM-driven path: set the DOM selection directly,
		// then dispatch selectionchange so the editor's handler echoes
		// it into the model. By the time render_selection runs the
		// model already matches the DOM and the skip should fire.
		const trailing_gap = arr.querySelector(':scope > .node-gap.gap-after.last .svedit-selectable');
		expect(trailing_gap).not.toBeNull();
		const range = document.createRange();
		range.setStart(trailing_gap, 1);
		range.setEnd(trailing_gap, 1);
		window.getSelection().removeAllRanges();
		window.getSelection().addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		const scroll_before = arr.scrollLeft;
		await settle();

		// DOM-driven path → skip fires → no scroll.
		expect(arr.scrollLeft).toBe(scroll_before);
	});

	it('does scrollIntoView when a model-driven selection change leaves the DOM at a stale scroll (insert)', async () => {
		// Regression for the original bug: Svelte reuses the trailing
		// gap DOM element with a shifted data-gap-offset after an
		// insert, so a DOM readback matches the new model — but the
		// scroll position is stale and the new node + cursor are off-
		// screen. Model-driven path must skip the skip.
		const session = make_story_session(20);
		const { container } = render(SveditTest, { session });
		await settle();

		const arr = find_buttons_array(container);
		arr.scrollLeft = arr.scrollWidth;
		await settle();
		const scroll_before = arr.scrollLeft;

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		canvas.focus();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: 20,
			focus_offset: 20
		};
		await settle();

		insert_button(session);
		await settle();

		// Model-driven (inserter) → render runs → array rescrolls to
		// new max → new node + trailing cursor visible.
		expect(arr.scrollLeft).toBeGreaterThan(scroll_before);
	});
});
