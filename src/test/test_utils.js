/**
 * Shared timing / session / DOM helpers for the browser test suite.
 *
 * Pulled out so the three spec files (focus_retention, gap_visibility,
 * selection_scroll) stay focused on their assertions instead of
 * re-implementing the same scaffolding.
 */

import { tick } from 'svelte';
import Session from '../lib/Session.svelte.js';
import { document_schema, session_config } from '../routes/create_demo_session.js';

/** Sleep one or more requestAnimationFrame ticks. */
export function raf(times = 1) {
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

/**
 * Let Svelte + IO + scroll-listener RAFs settle. Default values cover
 * the row-buttons-array case. Grid / wrap-flow tests can pass a longer
 * RAF count and ms tail because grid layout settles a frame or two
 * later than a fixed-width row.
 *
 * @param {{ rafs?: number, ms?: number }} [opts]
 */
export async function settle({ rafs = 3, ms = 60 } = {}) {
	await tick();
	await raf(rafs);
	await new Promise((r) => setTimeout(r, ms));
}

/** Generous settle for image-grid / wrap-flow scenarios. */
export const settle_grid = () => settle({ rafs: 8, ms: 150 });

/** Build a session with a single story whose `buttons` array holds `n` buttons. */
export function make_story_session(n_buttons) {
	const button_ids = [];
	const nodes = {};
	for (let i = 0; i < n_buttons; i++) {
		const id = `btn_${i}`;
		nodes[id] = {
			id,
			type: 'button',
			content: { text: `Action ${i + 1}`, annotations: [] },
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
export function make_image_grid_session(n_items) {
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

/** Find the (non-empty) buttons node-array inside the rendered tree. */
export function find_buttons_array(container) {
	return container.querySelector('[data-type="node_array"][data-path$="buttons"]:not(.empty)');
}

/** Find the image-grid items node-array inside the rendered tree. */
export function find_image_grid_array(container) {
	return container.querySelector('[data-type="node_array"][data-path$="image_grid_items"]');
}

/** The trailing .gap-after.last element of a node-array. */
export function find_last_gap(array_el) {
	return array_el.querySelector(':scope > .node-gap.gap-after.last');
}

/** The leading .gap-before element of a node-array (skips the empty-array placeholder). */
export function find_first_gap(array_el) {
	return array_el.querySelector(':scope > .node-gap.gap-before:not(.empty)');
}
