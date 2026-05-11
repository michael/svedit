/**
 * Tests for insert-driven selection / scroll behaviour.
 *
 * The button inserter (single-text-field nodes generally) must leave the
 * caret INSIDE the newly-inserted node's editable text. That way:
 *   1. The user sees a blinking caret on the new (otherwise empty) node
 *      and can immediately tell the insert worked.
 *   2. They can immediately type the new node's label without an extra
 *      selection step.
 *   3. The browser auto-focuses the text element → scrollIntoView for
 *      text selections is guaranteed to bring it into view.
 *
 * Block-type nodes that have multiple text fields keep the caret at the
 * gap so the user picks which field to start with (covered by other
 * inserter tests, not here).
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

function buttons_array(container) {
	return container.querySelector('[data-type="node_array"][data-path$="buttons"]:not(.empty)');
}

/** Insert a button via the session's configured inserter, then commit. */
function insert_button(session) {
	const tr = session.tr;
	session.config.inserters.button(tr);
	session.apply(tr);
}

describe('button inserter caret placement', () => {
	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('lands the caret inside the new button\'s label after inserting at a mid gap', async () => {
		const session = make_story_session(20);
		const { container } = render(SveditTest, { session });
		await settle();

		const arr = buttons_array(container);
		expect(arr).not.toBeNull();
		expect(arr.scrollWidth).toBeGreaterThan(arr.clientWidth + 100);

		const target_offset = 5;
		const canvas = container.querySelector('.svedit-canvas');
		canvas.focus();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: target_offset,
			focus_offset: target_offset
		};
		await settle();

		const count_before = session.doc.nodes.story_1.buttons.length;
		insert_button(session);
		await settle();

		// One new button got created
		expect(session.doc.nodes.story_1.buttons.length).toBe(count_before + 1);

		// Selection moved to a text caret inside the new button's label.
		// The new button sits at offset `target_offset` in the array;
		// the path's last two segments must be that offset + 'label'.
		const sel = session.selection;
		expect(sel).toBeTruthy();
		expect(sel.type).toBe('text');
		expect(sel.path[sel.path.length - 1]).toBe('label');
		expect(sel.path[sel.path.length - 2]).toBe(target_offset);
		expect(sel.anchor_offset).toBe(0);
		expect(sel.focus_offset).toBe(0);

		// And the new button is on screen, fully inside the array.
		const new_btn_path = `page_1__body__0__buttons__${target_offset}`;
		const new_btn = container.querySelector(`[data-path="${new_btn_path}"]`);
		expect(new_btn).not.toBeNull();
		const bcr = new_btn.getBoundingClientRect();
		const ar = arr.getBoundingClientRect();
		const visible_width = Math.max(0, Math.min(bcr.right, ar.right) - Math.max(bcr.left, ar.left));
		expect(visible_width).toBeGreaterThan(0);
	});

	it('lands the caret inside the new button\'s label after inserting at the trailing gap', async () => {
		const session = make_story_session(20);
		const { container } = render(SveditTest, { session });
		await settle();

		const arr = buttons_array(container);
		arr.scrollLeft = arr.scrollWidth;
		await settle();

		const last_offset = 20;
		const canvas = container.querySelector('.svedit-canvas');
		canvas.focus();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: last_offset,
			focus_offset: last_offset
		};
		await settle();

		insert_button(session);
		await settle();

		const sel = session.selection;
		expect(sel.type).toBe('text');
		expect(sel.path[sel.path.length - 1]).toBe('label');
		expect(sel.path[sel.path.length - 2]).toBe(last_offset);

		const new_btn = container.querySelector(
			`[data-path="page_1__body__0__buttons__${last_offset}"]`
		);
		expect(new_btn).not.toBeNull();
		// At trailing gap → new button becomes the new last node. scrollIntoView
		// on the focused .label element should bring it into the visible band.
		const bcr = new_btn.getBoundingClientRect();
		const ar = arr.getBoundingClientRect();
		const overlap = Math.max(0, Math.min(bcr.right, ar.right) - Math.max(bcr.left, ar.left));
		expect(overlap).toBeGreaterThan(0);
	});
});
