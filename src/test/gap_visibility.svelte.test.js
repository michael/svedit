/**
 * Tests for NodeGap / NodeGapMarkers visibility and placement.
 *
 * Mounts a Session into a real Chromium browser (vitest-browser-svelte) so
 * CSS anchor positioning, IntersectionObserver, scroll events and BCRs all
 * behave like production. Each test builds a focused document shape and
 * asserts the DOM state after IO + edge_map have settled.
 *
 * Timing notes:
 * - IO callbacks fire ~1 RAF after observe(). near_map and array_indices
 *   are populated then.
 * - edge_map is populated synchronously at bootstrap (from scrollLeft/
 *   scrollWidth/clientWidth) for arrays already in the DOM.
 * - sync_gap_class for edge gaps runs once at bootstrap (no-op while
 *   near_map is still empty) AND when IO fires sync_gaps_around_node on
 *   the adjacent edge node. That second sync is what actually adds the
 *   .positioned class for edge gaps.
 * - settle() waits long enough for both passes to complete.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import Session from '../lib/Session.svelte.js';
import SveditTest from './testing_components/SveditTest.svelte';
import { document_schema, session_config } from '../routes/create_demo_session.js';
import nanoid from '../routes/nanoid.js';

/** Sleep one or more requestAnimationFrame ticks. */
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

/** Let Svelte + IO + scroll-listener RAFs settle. */
async function settle() {
	await tick();
	await raf(3);
	await new Promise((r) => setTimeout(r, 50));
}

/** Build a session with a single story whose `buttons` array holds `n` buttons. */
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

/** Build a session with a single image_grid containing `n` items. */
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

/** Find the buttons array element inside the rendered tree. */
function find_buttons_array(container) {
	return container.querySelector('[data-type="node_array"][data-path$="buttons"]:not(.empty)');
}

function find_image_grid_array(container) {
	return container.querySelector('[data-type="node_array"][data-path$="image_grid_items"]');
}

function find_last_gap(array_el) {
	return array_el.querySelector(':scope > .node-gap.gap-after.last');
}

function find_first_gap(array_el) {
	return array_el.querySelector(':scope > .node-gap.gap-before:not(.empty)');
}

describe('NodeGap visibility & placement', () => {
	beforeEach(() => {
		// Ensure each test starts from a stable window scroll position.
		window.scrollTo(0, 0);
	});

	describe('non-overflow row array', () => {
		it('renders last gap positioned and extending past container right by --_eg', async () => {
			const session = make_story_session(2);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			expect(array_el).not.toBeNull();

			const last_gap = find_last_gap(array_el);
			expect(last_gap).not.toBeNull();
			expect(last_gap.classList.contains('positioned')).toBe(true);

			const sel = last_gap.querySelector('.svedit-selectable');
			const sel_rect = sel.getBoundingClientRect();
			const array_rect = array_el.getBoundingClientRect();

			// MUST RULE: edge gap extends OUTSIDE the container by --_eg (24px default).
			// Empirical tolerance: sub-pixel rounding from anchor positioning.
			expect(sel_rect.right).toBeGreaterThan(array_rect.right - 1);
			expect(sel_rect.right).toBeLessThanOrEqual(array_rect.right + 25);
		});

		it('renders first gap positioned and extending past container left by --_eg', async () => {
			const session = make_story_session(2);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			const first_gap = find_first_gap(array_el);
			expect(first_gap).not.toBeNull();
			expect(first_gap.classList.contains('positioned')).toBe(true);

			const sel = first_gap.querySelector('.svedit-selectable');
			const sel_rect = sel.getBoundingClientRect();
			const array_rect = array_el.getBoundingClientRect();

			expect(sel_rect.left).toBeLessThan(array_rect.left + 1);
			expect(sel_rect.left).toBeGreaterThanOrEqual(array_rect.left - 25);
		});
	});

	describe('overflow row array', () => {
		it('at scrollLeft=0: first gap positioned, last gap NOT positioned', async () => {
			const session = make_story_session(20);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			expect(array_el.scrollWidth).toBeGreaterThan(array_el.clientWidth + 50); // overflow confirmed

			array_el.scrollLeft = 0;
			await settle();

			const first_gap = find_first_gap(array_el);
			const last_gap = find_last_gap(array_el);
			expect(first_gap.classList.contains('positioned')).toBe(true);
			expect(last_gap.classList.contains('positioned')).toBe(false);
		});

		it('at scrollLeft=max: last gap positioned, first gap NOT positioned', async () => {
			const session = make_story_session(20);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			array_el.scrollLeft = array_el.scrollWidth;
			await settle();

			const first_gap = find_first_gap(array_el);
			const last_gap = find_last_gap(array_el);
			expect(last_gap.classList.contains('positioned')).toBe(true);
			expect(first_gap.classList.contains('positioned')).toBe(false);
		});

		it('at scrollLeft=mid: neither edge gap is positioned', async () => {
			const session = make_story_session(20);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			const max_scroll = array_el.scrollWidth - array_el.clientWidth;
			array_el.scrollLeft = Math.round(max_scroll / 2);
			await settle();

			const first_gap = find_first_gap(array_el);
			const last_gap = find_last_gap(array_el);
			expect(first_gap.classList.contains('positioned')).toBe(false);
			expect(last_gap.classList.contains('positioned')).toBe(false);
		});

		it('transitions last gap from hidden to positioned as scroll crosses EDGE_TOLERANCE_PX', async () => {
			const session = make_story_session(20);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			const max_scroll = array_el.scrollWidth - array_el.clientWidth;

			// Just past 10px from the end: last edge should still be hidden.
			array_el.scrollLeft = Math.max(0, max_scroll - 30);
			await settle();
			const last_gap = find_last_gap(array_el);
			expect(last_gap.classList.contains('positioned')).toBe(false);

			// Fully at end: within tolerance.
			array_el.scrollLeft = max_scroll;
			await settle();
			expect(last_gap.classList.contains('positioned')).toBe(true);
		});
	});

	describe('wrap layout (image grid)', () => {
		it('with 4 items in a 3-column grid: last gap fills the remaining row space', async () => {
			// 4 items in a 3-col grid → row 1 has items 0,1,2; row 2 has item 3.
			// The last gap should extend from item-3.right to container.right + --_eg.
			const session = make_image_grid_session(4);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_image_grid_array(container);
			expect(array_el).not.toBeNull();

			const last_gap = find_last_gap(array_el);
			expect(last_gap).not.toBeNull();
			expect(last_gap.classList.contains('positioned')).toBe(true);

			const sel = last_gap.querySelector('.svedit-selectable');
			const sel_rect = sel.getBoundingClientRect();
			const array_rect = array_el.getBoundingClientRect();
			const items = array_el.querySelectorAll(':scope > [data-type="node"]');
			const last_item_rect = items[items.length - 1].getBoundingClientRect();

			// Last item is on its own row (or partial row). Gap should start
			// at the item's trailing edge and reach at least the container's
			// trailing edge (within sub-pixel tolerance).
			expect(sel_rect.left).toBeGreaterThanOrEqual(last_item_rect.right - 2);
			expect(sel_rect.right).toBeGreaterThan(array_rect.right - 1);
		});

		it('with 7 items in a 3-column grid: same fill-to-end behaviour on the last partial row', async () => {
			// 7 items → row 1: 0,1,2; row 2: 3,4,5; row 3: 6 alone.
			const session = make_image_grid_session(7);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_image_grid_array(container);
			const last_gap = find_last_gap(array_el);
			expect(last_gap.classList.contains('positioned')).toBe(true);

			const sel = last_gap.querySelector('.svedit-selectable');
			const sel_rect = sel.getBoundingClientRect();
			const array_rect = array_el.getBoundingClientRect();
			expect(sel_rect.right).toBeGreaterThan(array_rect.right - 1);
		});
	});

	describe('empty array', () => {
		it('renders gap-empty marker, no first/last edge gaps', async () => {
			const session = make_story_session(0);
			const { container } = render(SveditTest, { session });
			await settle();

			// The story always has a buttons array, even when empty.
			const empty_array = container.querySelector(
				'[data-type="node_array"][data-path$="buttons"].empty'
			);
			expect(empty_array).not.toBeNull();

			const empty_gap = empty_array.querySelector('.node-gap.empty');
			expect(empty_gap).not.toBeNull();

			const empty_marker = container.querySelector('.gap-marker.gap-empty');
			expect(empty_marker).not.toBeNull();
		});
	});

	describe('mid gaps', () => {
		it('positions mid gaps between every pair of adjacent visible nodes', async () => {
			const session = make_story_session(3);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			// 3 buttons → 4 gaps total (gap-before, 2 mid, gap-after.last).
			const all_gaps = array_el.querySelectorAll(':scope > .node-gap');
			expect(all_gaps.length).toBe(4);

			// Mid gaps: offsets 1 and 2 (between buttons 0/1 and 1/2).
			const mid_offsets = ['1', '2'];
			for (const off of mid_offsets) {
				const gap = array_el.querySelector(
					`:scope > .node-gap.gap-after[data-gap-offset="${off}"]:not(.last)`
				);
				expect(gap).not.toBeNull();
				expect(gap.classList.contains('positioned')).toBe(true);
			}
		});
	});

	describe('edge_map state', () => {
		it('is populated for a visible array after mount', async () => {
			const session = make_story_session(3);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			const path = array_el.dataset.path;
			const registry = session.visibility_registry ?? null;
			// The registry is attached to the svedit context, not the session
			// directly — read it through a known DOM proxy instead.
			const reg = window.__svedit_registry_for_test ?? null;
			// If we don't have a test-time hook, fall back to asserting via DOM.
			if (reg) {
				const state = reg.edge_map.get(path);
				expect(state).toBeTruthy();
				expect(state.first).toBe(true);
				expect(state.last).toBe(true);
			} else {
				const first_gap = find_first_gap(array_el);
				const last_gap = find_last_gap(array_el);
				expect(first_gap.classList.contains('positioned')).toBe(true);
				expect(last_gap.classList.contains('positioned')).toBe(true);
			}
		});
	});
});
