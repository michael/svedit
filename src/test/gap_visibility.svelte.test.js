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
import SveditTest from './testing_components/SveditTest.svelte';
import {
	settle,
	settle_grid,
	make_story_session,
	make_image_grid_session,
	find_buttons_array,
	find_image_grid_array,
	find_last_gap,
	find_first_gap
} from './test_utils.js';

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
		// Helper: scroll the LAST item itself into the IO overscan zone
		// and wait for the IO to populate near_map. Centering the whole
		// array doesn't work when the array is taller than the viewport
		// (image-grid items stack in column mode at narrow vitest
		// viewports, producing a 2000+ px array).
		async function ensure_last_item_observed(array_el) {
			const items = array_el.querySelectorAll(':scope > [data-type="node"]');
			items[items.length - 1].scrollIntoView({ block: 'center' });
			await settle_grid();
		}

		it('with 4 items: edge_state.last is true and last gap is positioned', async () => {
			const session = make_image_grid_session(4);
			const { container } = render(SveditTest, { session });
			await settle_grid();

			const array_el = find_image_grid_array(container);
			expect(array_el).not.toBeNull();
			await ensure_last_item_observed(array_el);

			// 1) Core wrap-fill logic: edge_state.last must be true. This
			// is what sync_edge_state computes from the array's own
			// scrollLeft/scrollWidth/clientWidth — independent of IO timing
			// or viewport size, so it's the load-bearing assertion for the
			// wrap-fill behaviour.
			const ctx = /** @type {any} */ (globalThis).__svedit_ctx_for_test;
			expect(ctx).toBeTruthy();
			const edge_state = ctx.visibility_registry.edge_map.get(array_el.dataset.path);
			expect(edge_state).toBeTruthy();
			expect(edge_state.last).toBe(true);

			// 2) Integration: with the last item now in the IO overscan
			// zone, the gap should be .positioned. If this fails the
			// diagnostic JSON points at which link in IO → near_map →
			// sync_gap_class broke.
			const last_gap = find_last_gap(array_el);
			expect(last_gap).not.toBeNull();
			const items = Array.from(array_el.querySelectorAll(':scope > [data-type="node"]'));
			const last_item = items[items.length - 1];
			const li_rect = last_item.getBoundingClientRect();
			const arr_rect = array_el.getBoundingClientRect();
			const diag = {
				positioned: last_gap.classList.contains('positioned'),
				item_count: items.length,
				array_path: array_el.dataset.path,
				array_rect: { x: arr_rect.x, y: arr_rect.y, w: arr_rect.width, h: arr_rect.height },
				array_scroll: {
					sl: array_el.scrollLeft, sw: array_el.scrollWidth, cw: array_el.clientWidth,
					st: array_el.scrollTop, sh: array_el.scrollHeight, ch: array_el.clientHeight
				},
				last_item_path: last_item.dataset.path,
				last_item_rect: { x: li_rect.x, y: li_rect.y, w: li_rect.width, h: li_rect.height },
				last_item_in_viewport: li_rect.bottom > 0 && li_rect.top < window.innerHeight,
				last_gap_prev_is_last_item: last_gap.previousElementSibling === last_item,
				near_has_last: ctx.visibility_registry.near_map.has(last_item.dataset.path),
				edge_state
			};
			expect(last_gap.classList.contains('positioned'), JSON.stringify(diag, null, 2)).toBe(true);
		});

		it('with 7 items: edge_state.last is true and last gap is positioned', async () => {
			const session = make_image_grid_session(7);
			const { container } = render(SveditTest, { session });
			await settle_grid();

			const array_el = find_image_grid_array(container);
			await ensure_last_item_observed(array_el);

			const ctx = /** @type {any} */ (globalThis).__svedit_ctx_for_test;
			const edge_state = ctx.visibility_registry.edge_map.get(array_el.dataset.path);
			expect(edge_state?.last).toBe(true);

			const last_gap = find_last_gap(array_el);
			expect(last_gap.classList.contains('positioned')).toBe(true);
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
			const ctx = /** @type {any} */ (globalThis).__svedit_ctx_for_test;
			expect(ctx).toBeTruthy();
			const state = ctx.visibility_registry.edge_map.get(path);
			expect(state).toBeTruthy();
			expect(state.first).toBe(true);
			expect(state.last).toBe(true);
		});
	});
});
