/**
 * Keymap-continuity tests: after various in-canvas operations, can the user
 * still trigger keymap-bound commands?
 *
 * This is the test Michael's review pointed at: removing
 * `node_array_el.focus()` in __render_node_selection is supposed to make the
 * canvas-internal focus-shift go away on the node-selection rerender path.
 * The relatedTarget guard in handle_canvas_blur exists to defend against the
 * same class of bug — but only via the synthetic-event tests in
 * focus_retention.svelte.test.js, which don't actually exercise the real
 * dispatch chain (KeyMapper → command).
 *
 * These tests close that gap. They:
 *   1. Mount a Svedit with a real KeyMapper wired up (via
 *      SveditTestWithKeymap.svelte) so dispatched keydown events traverse
 *      the actual scope stack.
 *   2. Run the canonical button-inserter flow that originally regressed:
 *      set a node-caret in an array, call the button inserter, dispatch
 *      Enter on the canvas, assert the array grew again (InsertDefaultNodeCommand
 *      fired).
 *   3. Provide a 4-state experimental matrix:
 *        a. Step A applied,  guard present   → PASS (current state)
 *        b. Step A applied,  guard removed   → PASS (Step A makes guard redundant)
 *        c. Step A reverted, guard present   → PASS (guard catches the focus shift)
 *        d. Step A reverted, guard removed   → FAIL (no protection; keymap pops)
 *      If the matrix matches, the test genuinely locks in the contract.
 *
 * The text-selection branch (Enter on a text caret → BreakTextNodeCommand)
 * exercises the OTHER in-canvas focus shift (`el.focus()` in
 * __render_text_selection). That path is currently still guarded by the
 * relatedTarget bail-out. Once a future Step A+ removes `el.focus()`, the
 * guard becomes redundant for the text path too.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SveditTestWithKeymap from './testing_components/SveditTestWithKeymap.svelte';
import { settle, make_story_session } from './test_utils.js';
import Session from '../lib/Session.svelte.js';
import { document_schema, session_config } from '../routes/create_demo_session.js';

/**
 * Build a session whose body holds a single paragraph text node.
 * `break_text_node` requires the text property's owner to have kind 'text',
 * so we need this — `make_story_session` puts text properties on buttons and
 * stories (kind 'composed'), where break_text_node would bail.
 */
function make_paragraph_session(text = 'Hello world') {
	return new Session(
		document_schema,
		{
			document_id: 'page_1',
			nodes: {
				paragraph_1: {
					id: 'paragraph_1',
					type: 'paragraph',
					layout: 1,
					content: { text, annotations: [] }
				},
				page_1: {
					id: 'page_1',
					type: 'page',
					body: { nodes: ['paragraph_1'], annotations: [] },
					keywords: [],
					daily_visitors: [],
					created_at: '2025-05-30T10:39:59.987Z'
				}
			}
		},
		{ ...session_config }
	);
}

/**
 * Dispatches a synthetic Enter keydown that bubbles up to the window-level
 * listener installed by SveditTestWithKeymap. KeyMapper inspects the event
 * shape (`key`, modifier flags) and walks the scope stack.
 *
 * @param {Element} target
 */
function press_enter(target) {
	target.dispatchEvent(
		new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true
		})
	);
}

describe('keymap continuity', () => {
	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('after inserting a button at a node-caret, Enter still inserts the next default node', async () => {
		// 2 existing buttons in the buttons array. Place the caret at the
		// trailing gap (offset 2), insert a button, then press Enter.
		// With the current contract (Step A applied), the canvas keeps focus
		// throughout, the keymap stack stays put, and Enter dispatches to
		// InsertDefaultNodeCommand which inserts another default node into
		// the buttons array.
		const session = make_story_session(2);
		const { container } = render(SveditTestWithKeymap, { session });
		await settle();

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		expect(canvas).not.toBeNull();
		canvas.focus();
		await settle();

		const buttons_path = ['page_1', 'body', 0, 'buttons'];
		session.selection = {
			type: 'node',
			path: buttons_path,
			anchor_offset: 2,
			focus_offset: 2
		};
		await settle();

		const length_before_insert = session.get(buttons_path).length;
		expect(length_before_insert).toBe(2);

		// Invoke the button inserter exactly the way the toolbar does.
		const tr = session.tr;
		session.config.inserters.button(tr);
		session.apply(tr);
		await settle();

		const length_after_insert = session.get(buttons_path).length;
		expect(length_after_insert).toBe(length_before_insert + 1);

		// Now the real test: Enter on a node-caret should fire
		// InsertDefaultNodeCommand, growing the array again. If the canvas
		// blur fired during the insert above and popped the keymap, Enter
		// goes nowhere and the array stays at length 3.
		press_enter(canvas);
		await settle();

		expect(session.get(buttons_path).length).toBe(length_after_insert + 1);
	});

	it('after rendering a text selection inside the canvas, Enter splits the text node', async () => {
		// Set a text caret in the middle of a paragraph's content.
		// render_selection runs __render_text_selection, which currently
		// calls el.focus() on the text element — an in-canvas focus shift.
		// Without the relatedTarget guard in handle_canvas_blur, that focus
		// shift would pop the keymap and Enter would go nowhere. With the
		// guard, Enter fires BreakTextNodeCommand which splits the
		// paragraph: the body array grows from 1 to 2.
		const session = make_paragraph_session('Hello world');
		const { container } = render(SveditTestWithKeymap, { session });
		await settle();

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		expect(canvas).not.toBeNull();
		canvas.focus();
		await settle();

		const body_path = ['page_1', 'body'];
		// Caret in the middle of "Hello world".
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'content'],
			anchor_offset: 5,
			focus_offset: 5
		};
		await settle();

		expect(session.get(body_path).length).toBe(1);

		press_enter(canvas);
		await settle();

		// break_text_node splits the paragraph into two; the second part
		// is inserted as a new text node into body.
		expect(session.get(body_path).length).toBe(2);
	});

	it('inside a non-text node text property with allow_newlines, Enter inserts a newline with current line indentation', async () => {
		const session = make_story_session(1);
		const content_path = ['page_1', 'body', 0, 'description'];
		const tr = session.tr;
		tr.set(content_path, { text: 'Line\n\t  Item', annotations: [] });
		session.apply(tr);

		const { container } = render(SveditTestWithKeymap, { session });
		await settle();

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		expect(canvas).not.toBeNull();
		canvas.focus();
		await settle();

		session.selection = {
			type: 'text',
			path: content_path,
			anchor_offset: 8,
			focus_offset: 8
		};
		await settle();

		const text_before = session.get(content_path).text;
		expect(text_before).toBe('Line\n\t  Item');

		press_enter(canvas);
		await settle();

		const text_after = session.get(content_path).text;
		expect(text_after).toBe('Line\n\t  \n\t  Item');
		expect(session.get(['page_1', 'body']).length).toBe(1);
	});

	it('inside story.title (non-text node, allow_newlines=false), Enter does nothing', async () => {
		const session = make_story_session(1);
		const content_path = ['page_1', 'body', 0, 'title'];
		const { container } = render(SveditTestWithKeymap, { session });
		await settle();

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		expect(canvas).not.toBeNull();
		canvas.focus();
		await settle();

		session.selection = {
			type: 'text',
			path: content_path,
			anchor_offset: 5,
			focus_offset: 5
		};
		await settle();

		const text_before = session.get(content_path).text;
		expect(text_before).toBe('Test story');

		press_enter(canvas);
		await settle();

		const text_after = session.get(content_path).text;
		expect(text_after).toBe('Test story');
		expect(session.get(['page_1', 'body']).length).toBe(1);
		expect(session.get(['page_1', 'body', 0, 'buttons']).length).toBe(1);
	});
});
