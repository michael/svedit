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
 *    still dragging. Mitigation: a pointer_down guard inside the
 *    scroll path.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import Session from '../lib/Session.svelte.js';
import SveditTest from './testing_components/SveditTest.svelte';
import { document_schema, session_config } from '../routes/create_demo_session.js';

function raf(times = 1) {
	return new Promise((resolve) => {
		let remaining = times;
		function step() {
			remaining -= 1;
			if (remaining <= 0) resolve();
			else requestAnimationFrame(step);
		}
		requestAnimationFrame(step);
	});
}

async function settle() {
	await tick();
	await raf(3);
	await new Promise((r) => setTimeout(r, 60));
}

function make_story_session(n_buttons) {
	const button_ids = [];
	const nodes = {};
	for (let i = 0; i < n_buttons; i++) {
		const id = `btn_${i}`;
		nodes[id] = {
			id,
			type: 'button',
			label: { text: `Action ${i + 1}`, annotations: [] },
			href: '#'
		};
		button_ids.push(id);
	}
	nodes.story_1 = {
		id: 'story_1',
		type: 'story',
		layout: 1,
		image: '',
		title: { text: 'Test story', annotations: [] },
		description: { text: 'desc', annotations: [] },
		buttons: button_ids
	};
	nodes.page_1 = {
		id: 'page_1',
		type: 'page',
		body: ['story_1'],
		keywords: [],
		daily_visitors: [],
		created_at: '2025-05-30T10:39:59.987Z'
	};
	return new Session(document_schema, { document_id: 'page_1', nodes }, { ...session_config });
}

function make_image_grid_session(n_items) {
	const item_ids = [];
	const nodes = {};
	for (let i = 0; i < n_items; i++) {
		const id = `igi_${i}`;
		nodes[id] = {
			id,
			type: 'image_grid_item',
			image: '',
			title: { text: `Item ${i + 1}`, annotations: [] },
			description: { text: 'desc', annotations: [] }
		};
		item_ids.push(id);
	}
	nodes.image_grid_1 = {
		id: 'image_grid_1',
		type: 'image_grid',
		layout: 1,
		image_grid_items: item_ids
	};
	nodes.page_1 = {
		id: 'page_1',
		type: 'page',
		body: ['image_grid_1'],
		keywords: [],
		daily_visitors: [],
		created_at: '2025-05-30T10:39:59.987Z'
	};
	return new Session(document_schema, { document_id: 'page_1', nodes }, { ...session_config });
}

function buttons_array(container) {
	return container.querySelector('[data-type="node_array"][data-path$="buttons"]:not(.empty)');
}

function image_grid_array(container) {
	return container.querySelector('[data-type="node_array"][data-path$="image_grid_items"]');
}

function last_gap(array_el) {
	return array_el.querySelector(':scope > .node-gap.gap-after.last');
}

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

		const arr = buttons_array(container);
		expect(arr).not.toBeNull();
		expect(arr.scrollWidth).toBeGreaterThan(arr.clientWidth + 100);

		// Start scrolled to max — i.e. the cursor sits on the trailing
		// gap (only visible when the array is at the end).
		arr.scrollLeft = arr.scrollWidth;
		await settle();
		const scroll_before = arr.scrollLeft;

		const canvas = container.querySelector('.svedit-canvas');
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

		const lg = last_gap(arr);
		expect(lg).not.toBeNull();
		expect(lg.classList.contains('positioned')).toBe(true);
	});

	it('keeps the trailing gap .positioned through a delete-cycle back to non-overflow', async () => {
		const session = make_story_session(20);
		const { container } = render(SveditTest, { session });
		await settle();

		const arr = buttons_array(container);
		expect(arr.scrollWidth).toBeGreaterThan(arr.clientWidth + 100);
		arr.scrollLeft = arr.scrollWidth;
		await settle();

		const canvas = container.querySelector('.svedit-canvas');
		canvas.focus();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: session.doc.nodes.story_1.buttons.length,
			focus_offset: session.doc.nodes.story_1.buttons.length
		};
		await settle();

		let safety = 25;
		while (safety-- > 0) {
			if (arr.scrollWidth <= arr.clientWidth + 5) break;
			if (session.doc.nodes.story_1.buttons.length <= 1) break;
			delete_selection(session);
			await settle();
		}

		expect(arr.scrollWidth).toBeLessThanOrEqual(arr.clientWidth + 5);
		const lg = last_gap(arr);
		expect(lg).not.toBeNull();
		expect(lg.classList.contains('positioned')).toBe(true);
	});
});

describe('node-selection scroll-into-view (wrap-grid image_grid)', () => {
	async function settle_grid() {
		await tick();
		await raf(8);
		await new Promise((r) => setTimeout(r, 150));
	}

	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('brings the newly-inserted item into the viewport when inserting at the trailing gap of a page-scrolling grid', async () => {
		const session = make_image_grid_session(12);
		const { container } = render(SveditTest, { session });
		await settle_grid();

		const arr = image_grid_array(container);
		expect(arr).not.toBeNull();
		const arr_rect = arr.getBoundingClientRect();
		// Sanity: trailing items are below the fold before we insert.
		expect(arr_rect.height).toBeGreaterThan(window.innerHeight - 100);

		window.scrollTo(0, 0);
		await settle_grid();

		const canvas = container.querySelector('.svedit-canvas');
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
		expect(in_viewport, `new item rect=${JSON.stringify({ t: r.top, b: r.bottom, vh: window.innerHeight })}`).toBe(true);
	});
});

describe('node-selection skip during user drag', () => {
	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('does not scrollIntoView while the pointer is held (mid-drag)', async () => {
		// Regression for the drag-loop scroll. While dragging, render
		// still runs (Svelte can't tell DOM-driven from model-driven),
		// but the scroll-into-view path is guarded by pointer_down so
		// the viewport doesn't get yanked away mid-drag.
		const session = make_story_session(20);
		const { container } = render(SveditTest, { session });
		await settle();

		const arr = buttons_array(container);
		expect(arr.scrollWidth).toBeGreaterThan(arr.clientWidth + 100);

		// Start NOT at the end so the trailing-gap scroll, if it fires,
		// would move scrollLeft.
		arr.scrollLeft = 0;
		await settle();

		const canvas = container.querySelector('.svedit-canvas');
		canvas.focus();

		// Simulate the user being mid-drag.
		document.dispatchEvent(new PointerEvent('pointerdown'));
		await settle();

		const scroll_before = arr.scrollLeft;
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: 20,
			focus_offset: 20
		};
		await settle();

		// The pointer_down guard prevents the scroll from firing.
		expect(arr.scrollLeft).toBe(scroll_before);

		// Releasing the pointer re-enables scroll-into-view for
		// subsequent selection changes.
		document.dispatchEvent(new PointerEvent('pointerup'));
		await settle();

		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: 20,
			focus_offset: 20
		};
		// Trigger render again (re-emit the same selection forces the
		// $effect to fire; the JSON compare will still bypass skip for
		// node selections, and pointer_down is now false).
		// To ensure a fresh render, briefly change and restore:
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: 19,
			focus_offset: 19
		};
		await settle();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: 20,
			focus_offset: 20
		};
		await settle();

		expect(arr.scrollLeft).toBeGreaterThan(scroll_before);
	});
});
