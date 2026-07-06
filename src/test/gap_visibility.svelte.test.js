/**
 * Tests for NodeGap / NodeGapMarkers visibility and placement.
 *
 * Mounts a Session into a real Chromium browser (vitest-browser-svelte) so
 * CSS anchor positioning, IntersectionObserver, scroll events and BCRs all
 * behave like production. Each test builds a focused document shape and
 * asserts the DOM state after IO + edge_map have settled.
 *
 * Node and array elements register with the visibility registry via
 * attachments; IntersectionObserver owns later viewport transitions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import StoryHmrProxy from './testing_components/StoryHmrProxy.svelte';
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
		it('keeps story buttons intrinsic-width and on the same row', async () => {
			const session = make_story_session(2);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			const nodes = array_el.querySelectorAll(':scope > [data-type="node"]');
			const first_rect = nodes[0].getBoundingClientRect();
			const second_rect = nodes[1].getBoundingClientRect();
			const array_rect = array_el.getBoundingClientRect();

			expect(getComputedStyle(array_el).display).toBe('flex');
			expect(first_rect.width).toBeLessThan(array_rect.width);
			expect(Math.abs(first_rect.top - second_rect.top)).toBeLessThan(1);
		});

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
					sl: array_el.scrollLeft,
					sw: array_el.scrollWidth,
					cw: array_el.clientWidth,
					st: array_el.scrollTop,
					sh: array_el.scrollHeight,
					ch: array_el.clientHeight
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

	describe('mid-delete', () => {
		// NodeArrayProperty's `{#each ... (index)}` keys by index, so a
		// mid-delete unmounts ONLY the trailing-index element. Surviving
		// siblings keep their DOM nodes and data-path attributes; their
		// content shifts but `near_map` entries remain valid. If anyone
		// ever changes that keying to e.g. `(node.id)`, this invariant
		// breaks and this test fails — pointing straight at the cause.
		it('removes only the trailing path from near_map, keeps adjacent gaps positioned', async () => {
			// 3 buttons fit the narrow vitest viewport. The mid-delete
			// invariant holds regardless of overflow, but a non-
			// overflowing array makes the edge-gap assertions
			// deterministic.
			const session = make_story_session(3);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			expect(array_el.scrollWidth).toBeLessThanOrEqual(array_el.clientWidth + 5);

			const ctx = /** @type {any} */ (globalThis).__svedit_ctx_for_test;
			const near_map = ctx.visibility_registry.near_map;
			const array_path = 'page_1__body__0__buttons';

			for (let i = 0; i < 3; i++) {
				expect(near_map.has(`${array_path}__${i}`)).toBe(true);
			}

			// Delete the button at offset 1 (mid).
			const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
			canvas.focus();
			session.selection = {
				type: 'node',
				path: ['page_1', 'body', 0, 'buttons'],
				anchor_offset: 1,
				focus_offset: 2
			};
			const tr = session.tr;
			tr.delete_selection();
			session.apply(tr);
			await settle();

			expect(session.doc.nodes.story_1.buttons.nodes.length).toBe(2);

			// near_map: __0 and __1 remain (surviving DOM elements
			// kept their data-path attributes — the element at __1 now
			// renders what was at __2). __2 is gone (trailing index
			// unmounted by Svelte's keyed-each-by-index).
			expect(near_map.has(`${array_path}__0`)).toBe(true);
			expect(near_map.has(`${array_path}__1`)).toBe(true);
			expect(near_map.has(`${array_path}__2`)).toBe(false);

			// Edge gaps stay positioned (no overflow → edge_map.first
			// and .last both true).
			expect(find_first_gap(array_el).classList.contains('positioned')).toBe(true);
			expect(find_last_gap(array_el).classList.contains('positioned')).toBe(true);
		});
	});

	describe('view-class application on inserted nodes', () => {
		// `.in-view` / `.seen` / `.fully-in-view` are part of the
		// library's public contract — user apps wire animations to them.
		// Document reconciliation must apply them reliably to inserted nodes.
		it('applies in-view and seen classes to newly-inserted nodes', async () => {
			const session = make_story_session(2);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			const before_count = array_el.querySelectorAll(':scope > [data-type="node"]').length;

			// The button inserter reads tr.selection.path — set a node
			// selection at the trailing gap before calling it.
			session.selection = {
				type: 'node',
				path: ['page_1', 'body', 0, 'buttons'],
				anchor_offset: 2,
				focus_offset: 2
			};
			await settle();
			const tr = session.tr;
			session.config.inserters.button(tr);
			session.apply(tr);
			await settle();

			const nodes = array_el.querySelectorAll(':scope > [data-type="node"]');
			expect(nodes.length).toBe(before_count + 1);
			const new_node = nodes[nodes.length - 1];
			expect(new_node.classList.contains('in-view')).toBe(true);
			expect(new_node.classList.contains('seen')).toBe(true);

			const ctx = /** @type {any} */ (globalThis).__svedit_ctx_for_test;
			const array_path = array_el.dataset.path;
			const visible = ctx.visibility_registry.get_array_indices(array_path);
			expect(Array.from(visible).sort((a, b) => a - b)).toEqual([0, 1, 2]);

			const markers = array_el.querySelectorAll(
				`:scope > .gap-marker[data-gap-array-path="${array_path}"]`
			);
			expect(Array.from(markers, (marker) => marker.dataset.gapOffset)).toEqual(['0', '1', '2']);
		});
	});

	describe('container resize without scroll or document change', () => {
		// A box-size change can flip an array between fitting and
		// overflowing while scrollLeft stays 0 — no scroll event fires
		// and no document change happens, so only the ResizeObserver
		// can re-sync edge_map. Covers window resizes, sidebar toggles
		// and responsive breakpoints alike.
		it('re-syncs edge gaps when the array container is resized', async () => {
			const session = make_story_session(3);
			const { container } = render(SveditTest, { session });
			await settle();

			const array_el = find_buttons_array(container);
			// Fits → both edge gaps positioned.
			expect(find_first_gap(array_el).classList.contains('positioned')).toBe(true);
			expect(find_last_gap(array_el).classList.contains('positioned')).toBe(true);

			// Shrink the container so the last button is only PARTIALLY
			// clipped (overflow past EDGE_TOLERANCE_PX, but well short of
			// the whole button). scrollLeft stays 0 and the node stays
			// near (a partial clip crosses no overscan-IO threshold), so
			// only the ResizeObserver's edge_map re-sync can hide the
			// last gap. A full clip would zero the node's intersection
			// and hide the gap via near_map instead, making this test
			// pass without the RO.
			array_el.style.maxWidth = `${array_el.clientWidth - 40}px`;
			await settle();
			const overflow = array_el.scrollWidth - array_el.clientWidth;
			expect(overflow).toBeGreaterThan(10); // past EDGE_TOLERANCE_PX
			expect(array_el.scrollLeft).toBe(0);
			// Guard against the vacuous pass: the last button must still
			// be near, so the gap's visibility is decided by edge_map.
			const ctx = /** @type {any} */ (globalThis).__svedit_ctx_for_test;
			expect(ctx.visibility_registry.near_map.has('page_1__body__0__buttons__2')).toBe(true);

			expect(find_first_gap(array_el).classList.contains('positioned')).toBe(true);
			expect(find_last_gap(array_el).classList.contains('positioned')).toBe(false);

			// Grow it back → fits again → last gap returns.
			array_el.style.maxWidth = '';
			await settle();
			expect(find_last_gap(array_el).classList.contains('positioned')).toBe(true);
		});
	});

	describe('DOM recreation without document change (dev-mode HMR)', () => {
		// Reproduces the "node gap no longer clickable after a code change in
		// dev mode" bug. When Vite/Svelte HMR replaces a node component, the
		// component's DOM subtree — including its node-gap elements — is
		// recreated, but session.doc and editable are unchanged, so the
		// reconcile effect in node_visibility never runs. The fresh .node-gap
		// elements never receive .positioned (0×0, pointer-events: none →
		// unclickable) and the fresh node elements are never observed by the
		// IntersectionObserver, so scrolling can't heal it. The next document
		// edit triggers reconcile and everything snaps back — matching the
		// observed "save the doc, edit again, gap works" behaviour.
		it('keeps gaps positioned after a node component subtree is recreated', async () => {
			const session = make_story_session(3);
			const { container } = render(SveditTest, { session });
			await settle();

			let array_el = find_buttons_array(container);
			const first_gap_before = find_first_gap(array_el);
			expect(first_gap_before.classList.contains('positioned')).toBe(true);
			expect(find_last_gap(array_el).classList.contains('positioned')).toBe(true);

			// Simulate HMR: swap the story component for an identical wrapper
			// (a fresh component reference). Svelte remounts the story subtree
			// — new node and node-gap DOM elements — with no document change.
			session.config = {
				...session.config,
				node_components: { ...session.config.node_components, story: StoryHmrProxy }
			};
			await settle();

			array_el = find_buttons_array(container);
			const first_gap = find_first_gap(array_el);
			const last_gap = find_last_gap(array_el);
			// Sanity: the swap really recreated the gap DOM.
			expect(first_gap).not.toBeNull();
			expect(first_gap).not.toBe(first_gap_before);

			// Desired behaviour: recreated gaps are positioned (clickable).
			expect(first_gap.classList.contains('positioned')).toBe(true);
			expect(last_gap.classList.contains('positioned')).toBe(true);
			const mid_gap = array_el.querySelector(
				':scope > .node-gap.gap-after[data-gap-offset="1"]:not(.last)'
			);
			expect(mid_gap.classList.contains('positioned')).toBe(true);

			// And the selectable hit area is actually clickable.
			const sel = first_gap.querySelector('.svedit-selectable');
			const sel_rect = sel.getBoundingClientRect();
			expect(sel_rect.width).toBeGreaterThan(0);
			expect(sel_rect.height).toBeGreaterThan(0);
			expect(getComputedStyle(sel).pointerEvents).toBe('auto');

			// Recreated node elements must be re-registered with the
			// observers too: view classes reappear without a document
			// change, proving near-tracking follows the new elements.
			const nodes = array_el.querySelectorAll(':scope > [data-type="node"]');
			expect(nodes.length).toBe(3);
			for (const node_el of nodes) {
				expect(node_el.classList.contains('in-view')).toBe(true);
				expect(node_el.classList.contains('seen')).toBe(true);
			}
		});
	});
});
