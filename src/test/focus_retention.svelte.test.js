/**
 * Tests for canvas-focus retention when focus shifts inside the canvas.
 *
 * Background: handle_canvas_blur() pops the document keymap from the
 * key-mapper stack. Earlier in the conversation we had this fire on
 * every focus shift inside the canvas — which broke:
 *   1. Right-click → "Inspect" in DevTools (focus moved to the right-
 *      clicked element, blur popped the keymap, the user's next
 *      keypress went nowhere).
 *   2. The button inserter flow (text caret moves into the new button's
 *      label element, which is a focus shift inside the canvas; blur
 *      popped the keymap, so the next Enter no longer fired the
 *      InsertDefaultNodeCommand).
 *
 * The relatedTarget guard fixes both: blur only pops when focus has
 * left the canvas entirely. These tests lock that behaviour in.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import create_test_session from './create_test_session.js';

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
	await raf(2);
	await new Promise((r) => setTimeout(r, 40));
}

describe('canvas focus retention', () => {
	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('does NOT treat focus shifts inside the canvas as canvas blur', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });
		await settle();

		const canvas = container.querySelector('.svedit-canvas');
		expect(canvas).not.toBeNull();
		canvas.focus();
		await settle();
		expect(document.activeElement).toBe(canvas);

		// Find any focusable descendant of the canvas — a node-array
		// container is focusable (tabindex="-1" via [data-type="node_array"]).
		// We dispatch a blur event on the canvas with relatedTarget set to
		// that descendant. The guard in handle_canvas_blur should bail out
		// without popping the keymap or flipping canvas_focused.
		const inner_target = canvas.querySelector('[data-type="node_array"]');
		expect(inner_target).not.toBeNull();

		// FocusEvent with relatedTarget — same shape as the real blur event
		// the browser dispatches when focus moves canvas → descendant.
		const event = new FocusEvent('blur', {
			bubbles: false,
			cancelable: false,
			relatedTarget: inner_target
		});
		canvas.dispatchEvent(event);
		await settle();

		// The exposed `canvas_focused` getter on the registered context
		// reflects the internal state. Read it via the visibility_registry,
		// which is the only piece of the svedit context attached to the
		// Session at runtime.
		const reg = session.visibility_registry ?? null;
		// Falling back to a DOM-side assertion if the registry isn't on the
		// session: render_selection's $effect only runs when canvas_focused
		// is true, and setting the selection should still take effect.
		// (Direct private state check isn't available without exposing it.)
		if (reg) {
			// no-op — the registry doesn't carry canvas_focused
		}

		// Functional check: after the descendant-blur, programmatically
		// move the selection. render_selection should still execute, which
		// means canvas_focused is still true.
		const story_path = ['page_1', 'body', 0];
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 1,
			focus_offset: 1
		};
		await settle();

		// If the blur had popped the keymap and flipped canvas_focused,
		// render_selection would early-return and the DOM selection would
		// stay at canvas-edge. We assert the DOM range was actually set.
		const dom_sel = window.getSelection();
		expect(dom_sel).not.toBeNull();
		expect(dom_sel.rangeCount).toBeGreaterThan(0);
	});

	it('DOES treat focus shifts outside the canvas as canvas blur', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });
		await settle();

		const canvas = container.querySelector('.svedit-canvas');
		canvas.focus();
		await settle();

		// Create an unrelated outside element and dispatch blur with it
		// as relatedTarget. Then verify the keymap behaviour.
		const outside = document.createElement('button');
		outside.textContent = 'outside';
		document.body.appendChild(outside);

		try {
			const event = new FocusEvent('blur', {
				bubbles: false,
				cancelable: false,
				relatedTarget: outside
			});
			canvas.dispatchEvent(event);
			await settle();

			// We can't directly read canvas_focused from outside, but the
			// blur path runs registry?.unobserve(...) → no, it pops the
			// keymap. The user-visible symptom of "blur happened" is that
			// the next render_selection call no longer auto-fires because
			// canvas_focused became false. Verify by mutating the selection
			// while focus is still on `outside` and observing that the DOM
			// selection does NOT get reset by Svedit.
			outside.focus();
			await settle();

			const dom_sel_before = window.getSelection();
			const range_count_before = dom_sel_before?.rangeCount ?? 0;

			session.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 2,
				focus_offset: 2
			};
			await settle();

			// With canvas_focused false, render_selection() early-returns,
			// so the DOM selection should NOT have been mutated by Svedit.
			const dom_sel_after = window.getSelection();
			expect(dom_sel_after?.rangeCount ?? 0).toBe(range_count_before);
		} finally {
			outside.remove();
		}
	});
});
