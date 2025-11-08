import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import create_test_doc from './create_test_doc.js';
import { join_text_node } from '../lib/commands.svelte.js';
import nanoid from '../routes/nanoid.js';

describe('Svedit.svelte', () => {
	it('should map node cursor to DOM', async () => {
		const doc = create_test_doc();

		/* const { container } = */ render(SveditTest, { doc });

		// Now set node cursor between first and second node
		doc.selection = {
			type: 'node',
			path: [doc.document_id, 'body'],
			anchor_offset: 1,
			focus_offset: 1
		};

		// Wait for Svelte effects to complete
		await tick();

		// Give browser time to update DOM selection after focus
		await new Promise((resolve) => setTimeout(resolve, 10));

		const dom_selection = window.getSelection();
		expect(dom_selection).not.toBeNull();
		expect(dom_selection.isCollapsed).toBe(true);
		expect(dom_selection.type).toBe('Caret');

		// @ts-ignore
		expect(dom_selection.anchorNode.classList.contains('cursor-trap')).toBe(true);
		// @ts-ignore
		expect(dom_selection.focusNode.classList.contains('cursor-trap')).toBe(true);
	});

	it('should map property selection to DOM', async () => {
		const doc = create_test_doc();
		/* const { container }  = */ render(SveditTest, { doc });

		// Now set property selection
		doc.selection = {
			type: 'property',
			path: [doc.document_id, 'body', 0, 'image']
		};

		// Wait for Svelte effects to complete
		await tick();

		// Give browser time to update DOM selection after focus
		await new Promise((resolve) => setTimeout(resolve, 10));

		const dom_selection = window.getSelection();
		expect(dom_selection).not.toBeNull();
		expect(dom_selection.isCollapsed).toBe(true);
		expect(dom_selection.type).toBe('Caret');
	});

	it('should allow copying and pasting a story node with button reference multiple times', async () => {
		const doc = create_test_doc();
		const { container } = render(SveditTest, { doc });

		// Get the original story and button content
		const original_story = doc.get('story_1');
		const original_button = doc.get('button_1');

		expect(original_story.title).toEqual({ text: 'First story', annotations: [] });
		expect(original_story.buttons).toEqual(['button_1']);
		expect(original_button.label).toEqual({ text: 'Get started', annotations: [] });

		// Initial body state: ['story_1, 'story_1, 'list_1]
		const initial_body = doc.get(['page_1', 'body']);
		expect(initial_body).toEqual(['story_1', 'story_1', 'list_1']);

		// Set selection to the first story node
		doc.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};

		await tick();

		// Simulate copy event with mock clipboardData
		let copied_html = '';
		let copied_text = '';

		const mock_clipboard_data = {
			setData: (format, data) => {
				if (format === 'text/html') {
					copied_html = data;
				} else if (format === 'text/plain') {
					copied_text = data;
				}
			},
			getData: (format) => {
				if (format === 'text/html') {
					return copied_html;
				} else if (format === 'text/plain') {
					return copied_text;
				}
				return '';
			}
		};

		const copy_event = new ClipboardEvent('copy', {
			bubbles: true,
			cancelable: true
		});

		// Mock the clipboardData property
		Object.defineProperty(copy_event, 'clipboardData', {
			value: mock_clipboard_data,
			writable: false
		});

		const svedit_element = container.querySelector('.svedit-canvas');
		// @ts-ignore
		svedit_element?.focus();

		document.dispatchEvent(copy_event);
		await tick();

		// Verify something was copied
		expect(copied_html).not.toBe('');

		// Keep same selection for paste (to replace, not insert)
		doc.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};

		await tick();

		// First paste - should replace the selected story
		const first_paste_event = new ClipboardEvent('paste', {
			bubbles: true,
			cancelable: true
		});

		// Mock the clipboardData property
		Object.defineProperty(first_paste_event, 'clipboardData', {
			value: mock_clipboard_data,
			writable: false
		});
		document.dispatchEvent(first_paste_event);
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10)); // Give time for transaction

		// Verify first paste - should still have 3 items (replaced, not inserted)
		const body_after_first_paste = doc.get(['page_1', 'body']);
		expect(body_after_first_paste.length).toBe(3);

		// Get the new story ID (first element should be the replaced one)
		const first_new_story_id = body_after_first_paste[0];
		const first_new_story = doc.get(first_new_story_id);
		const first_new_button_id = first_new_story.buttons[0];
		const first_new_button = doc.get(first_new_button_id);

		// Content should be the same as original
		expect(first_new_story.title).toEqual({ text: 'First story', annotations: [] });
		expect(first_new_story.description).toEqual({
			text: 'First story description.',
			annotations: []
		});
		expect(first_new_button.label).toEqual({ text: 'Get started', annotations: [] });
		expect(first_new_button.href).toBe('https://github.com/michael/svedit');

		// But IDs should be different
		expect(first_new_story_id).not.toBe('story_1');
		expect(first_new_button_id).not.toBe('button_1');
		expect(first_new_story.buttons).toEqual([first_new_button_id]);

		// Keep same selection for second paste (to replace again)
		doc.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};

		await tick();

		const second_paste_event = new ClipboardEvent('paste', {
			bubbles: true,
			cancelable: true
		});

		// Mock the clipboardData property
		Object.defineProperty(second_paste_event, 'clipboardData', {
			value: mock_clipboard_data,
			writable: false
		});
		document.dispatchEvent(second_paste_event);
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10)); // Give time for transaction

		// Verify second paste - should still have 3 total items (replaced again)
		const body_after_second_paste = doc.get(['page_1', 'body']);
		expect(body_after_second_paste.length).toBe(3);

		// Get the second new story ID (first element should be the second replacement)
		const second_new_story_id = body_after_second_paste[0];
		const second_new_story = doc.get(second_new_story_id);
		const second_new_button_id = second_new_story.buttons[0];
		const second_new_button = doc.get(second_new_button_id);

		// Content should still be the same
		expect(second_new_story.title).toEqual({ text: 'First story', annotations: [] });
		expect(second_new_story.description).toEqual({
			text: 'First story description.',
			annotations: []
		});
		expect(second_new_button.label).toEqual({ text: 'Get started', annotations: [] });
		expect(second_new_button.href).toBe('https://github.com/michael/svedit');

		// But IDs should be different from both original and first paste
		expect(second_new_story_id).not.toBe('story_1');
		expect(second_new_story_id).not.toBe(first_new_story_id);
		expect(second_new_button_id).not.toBe('button_1');
		expect(second_new_button_id).not.toBe(first_new_button_id);
		expect(second_new_story.buttons).toEqual([second_new_button_id]);

		// Verify the first paste's nodes no longer exist (they were replaced)
		expect(doc.get(first_new_story_id)).toBeUndefined();
		expect(doc.get(first_new_button_id)).toBeUndefined();

		// But the current (second) paste nodes exist
		expect(doc.get(second_new_story_id)).toBeDefined();
		expect(doc.get(second_new_button_id)).toBeDefined();

		// Original nodes should still exist (at position 1)
		expect(doc.get('story_1')).toBeDefined();
		expect(doc.get('button_1')).toBeDefined();
		expect(body_after_second_paste[1]).toBe('story_1');
	});

	describe('join_text_node command', () => {
		it('should delete empty text node when trying to join with non-text predecessor', () => {
			const doc = create_test_doc();

			// Create an empty text node after a story
			const empty_text_id = nanoid();
			const empty_text_node = {
				id: empty_text_id,
				type: 'text',
				layout: 1,
				content: { text: '', annotations: [] } // Empty content
			};

			const tr = doc.tr;
			tr.create(empty_text_node);

			// Insert the empty text node after the first story
			const body = doc.get(['page_1', 'body']);
			const new_body = [body[0], empty_text_id, ...body.slice(1)];
			tr.set(['page_1', 'body'], new_body);
			doc.apply(tr);

			// Set text selection in the empty text node (position 1 in body)
			doc.selection = {
				type: 'text',
				path: ['page_1', 'body', 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			};

			// Apply join_text_node command
			const join_tr = doc.tr;
			join_text_node(join_tr);
			doc.apply(join_tr);

			// Empty text node should be deleted
			expect(doc.get(empty_text_id)).toBeUndefined();

			// Body should be back to original state
			const final_body = doc.get(['page_1', 'body']);
			expect(final_body).toEqual(['story_1', 'story_1', 'list_1']);

			// Selection should be at position 1 (where the deleted node was)
			expect(doc.selection.type).toBe('node');
			expect(doc.selection.anchor_offset).toBe(1);
			expect(doc.selection.focus_offset).toBe(1);
		});

		it('should do nothing when trying to join non-empty text node with non-text predecessor', () => {
			const doc = create_test_doc();

			// Create a non-empty text node after a story
			const text_id = nanoid();
			const text_node = {
				id: text_id,
				type: 'text',
				layout: 1,
				content: { text: 'Some content', annotations: [] }
			};

			const tr = doc.tr;
			tr.create(text_node);

			// Insert the text node after the first story
			const body = doc.get(['page_1', 'body']);
			const new_body = [body[0], text_id, ...body.slice(1)];
			tr.set(['page_1', 'body'], new_body);
			doc.apply(tr);

			// Set text selection in the text node (position 1 in body)
			doc.selection = {
				type: 'text',
				path: ['page_1', 'body', 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			};

			// Apply join_text_node command
			const join_tr = doc.tr;
			const result = join_text_node(join_tr);

			// Should return false (no action taken)
			expect(result).toBe(false);

			// Text node should still exist
			expect(doc.get(text_id)).toBeDefined();
			expect(doc.get(text_id).content).toEqual({ text: 'Some content', annotations: [] });

			// Body should remain unchanged
			const final_body = doc.get(['page_1', 'body']);
			expect(final_body).toEqual(['story_1', text_id, 'story_1', 'list_1']);
		});

		it('should delete empty text node at position 0', () => {
			const doc = create_test_doc();

			// Create an empty text node and put it at the beginning
			const empty_text_id = nanoid();
			const empty_text_node = {
				id: empty_text_id,
				type: 'text',
				layout: 1,
				content: { text: '', annotations: [] } // Empty content
			};

			const tr = doc.tr;
			tr.create(empty_text_node);

			// Insert the empty text node at the beginning
			const body = doc.get(['page_1', 'body']);
			const new_body = [empty_text_id, ...body];
			tr.set(['page_1', 'body'], new_body);
			doc.apply(tr);

			// Set text selection in the empty text node (position 0 in body)
			doc.selection = {
				type: 'text',
				path: ['page_1', 'body', 0, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			};

			// Apply join_text_node command
			const join_tr = doc.tr;
			join_text_node(join_tr);
			doc.apply(join_tr);

			// Empty text node should be deleted
			expect(doc.get(empty_text_id)).toBeUndefined();

			// Body should be back to original state
			const final_body = doc.get(['page_1', 'body']);
			expect(final_body).toEqual(['story_1', 'story_1', 'list_1']);

			// Selection should be at position 0
			expect(doc.selection.type).toBe('node');
			expect(doc.selection.anchor_offset).toBe(0);
			expect(doc.selection.focus_offset).toBe(0);
		});

		it('should do nothing when non-empty text node is at position 0', () => {
			const doc = create_test_doc();

			// Create a non-empty text node and put it at the beginning
			const text_id = nanoid();
			const text_node = {
				id: text_id,
				type: 'text',
				layout: 1,
				content: { text: 'Some content', annotations: [] }
			};

			const tr = doc.tr;
			tr.create(text_node);

			// Insert the text node at the beginning
			const body = doc.get(['page_1', 'body']);
			const new_body = [text_id, ...body];
			tr.set(['page_1', 'body'], new_body);
			doc.apply(tr);

			// Set text selection in the text node (position 0 in body)
			doc.selection = {
				type: 'text',
				path: ['page_1', 'body', 0, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			};

			// Apply join_text_node command
			const join_tr = doc.tr;
			const result = join_text_node(join_tr);

			// Should return false (no action taken)
			expect(result).toBe(false);

			// Text node should still exist
			expect(doc.get(text_id)).toBeDefined();
			expect(doc.get(text_id).content).toEqual({ text: 'Some content', annotations: [] });

			// Body should remain unchanged
			const final_body = doc.get(['page_1', 'body']);
			expect(final_body).toEqual([text_id, 'story_1', 'story_1', 'list_1']);
		});

		it('should join two text nodes and position cursor at end of joined text', () => {
			const doc = create_test_doc();

			// Create two text nodes
			const first_text_id = nanoid();
			const second_text_id = nanoid();

			const first_text_node = {
				id: first_text_id,
				type: 'text',
				layout: 1,
				content: { text: 'First text', annotations: [] }
			};

			const second_text_node = {
				id: second_text_id,
				type: 'text',
				layout: 1,
				content: { text: ' second text', annotations: [] }
			};

			const tr = doc.tr;
			tr.create(first_text_node);
			tr.create(second_text_node);

			// Replace body with our two text nodes
			tr.set(['page_1', 'body'], [first_text_id, second_text_id]);
			doc.apply(tr);

			// Set text selection in the second text node
			doc.selection = {
				type: 'text',
				path: ['page_1', 'body', 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			};

			// Apply join_text_node command
			const join_tr = doc.tr;
			join_text_node(join_tr);
			doc.apply(join_tr);

			// Second text node should be deleted
			expect(doc.get(second_text_id)).toBeUndefined();

			// First text node should contain joined content
			const first_text = doc.get(first_text_id);
			expect(first_text.content).toEqual({ text: 'First text second text', annotations: [] });

			// Body should only contain the first text node
			const final_body = doc.get(['page_1', 'body']);
			expect(final_body).toEqual([first_text_id]);

			// Selection should be positioned at the end of the original first text
			expect(doc.selection.type).toBe('text');
			expect(doc.selection.path).toEqual(['page_1', 'body', 0, 'content']);
			expect(doc.selection.anchor_offset).toBe(10); // Length of "First text"
			expect(doc.selection.focus_offset).toBe(10);
		});
	});

	it('should encode and decode svedit data in HTML clipboard format', async () => {
		const doc = create_test_doc();
		const { container } = render(SveditTest, { doc });

		// Select a story node to copy
		doc.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};

		await tick();

		// Simulate copy event with mock clipboardData
		let copied_html = '';
		let copied_text = '';

		const mock_clipboard_data = {
			setData: (format, data) => {
				if (format === 'text/html') {
					copied_html = data;
				} else if (format === 'text/plain') {
					copied_text = data;
				}
			},
			getData: (format) => {
				if (format === 'text/html') {
					return copied_html;
				} else if (format === 'text/plain') {
					return copied_text;
				}
				return '';
			}
		};

		const copy_event = new ClipboardEvent('copy', {
			bubbles: true,
			cancelable: true
		});

		// Mock the clipboardData property
		Object.defineProperty(copy_event, 'clipboardData', {
			value: mock_clipboard_data,
			writable: false
		});

		const svedit_element = container.querySelector('.svedit-canvas');
		// @ts-ignore
		svedit_element?.focus();

		document.dispatchEvent(copy_event);
		await tick();

		// Verify clipboard data was captured
		expect(copied_html).not.toBe('');

		// Get the HTML content from clipboard
		const html_content = copied_html;

		// Verify HTML contains svedit data marker
		expect(html_content).toContain('data-svedit=');

		// Verify HTML contains fallback content
		expect(html_content).toContain('<meta charset="utf-8">');

		// Extract and verify the embedded data can be decoded
		const svedit_regex = /data-svedit="([^"]+)"/;
		const match = html_content.match(svedit_regex);
		expect(match).not.toBeNull();

		// Use our extraction function to properly decode the data
		const extract_svedit_data_from_html = (html) => {
			const svedit_regex = /data-svedit="([^"]+)"/;
			const match = html.match(svedit_regex);

			if (match && match[1]) {
				try {
					const base64_decoded = atob(match[1]);
					const decoded_data = decodeURIComponent(base64_decoded);
					return JSON.parse(decoded_data);
				} catch {
					return null;
				}
			}

			return null;
		};

		const decoded_data = extract_svedit_data_from_html(html_content);
		expect(decoded_data).toHaveProperty('nodes');
		expect(decoded_data).toHaveProperty('main_nodes');
		expect(decoded_data.main_nodes).toContain('story_1');

		// Test paste functionality with HTML format - insert at end
		doc.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 3,
			focus_offset: 3
		};

		const paste_event = new ClipboardEvent('paste', {
			bubbles: true,
			cancelable: true
		});

		// Mock the clipboardData property
		Object.defineProperty(paste_event, 'clipboardData', {
			value: mock_clipboard_data,
			writable: false
		});
		document.dispatchEvent(paste_event);
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 20)); // Give time for async paste operation

		// Verify paste worked - should have 4 items now (original 3 + 1 pasted)
		const body_after_paste = doc.get(['page_1', 'body']);
		expect(body_after_paste).toHaveLength(4);
	});

	it('should handle Unicode characters in clipboard data', async () => {
		const doc = create_test_doc();
		const { container } = render(SveditTest, { doc });

		// Create a text node with Unicode characters (emojis, special chars)
		const unicode_text_id = nanoid();
		const unicode_text_node = {
			id: unicode_text_id,
			type: 'text',
			layout: 1,
			content: { text: 'Hello 🌍 Unicode: café, naïve, 中文, 🚀 test!', annotations: [] }
		};

		const tr = doc.tr;
		tr.create(unicode_text_node);

		// Insert the text node at the beginning
		const body = doc.get(['page_1', 'body']);
		const new_body = [unicode_text_id, ...body];
		tr.set(['page_1', 'body'], new_body);
		doc.apply(tr);

		// Select the Unicode text node
		doc.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};

		await tick();

		// Mock clipboard API
		let clipboard_data = /** @type {ClipboardItem | null} */ (null);
		Object.defineProperty(navigator, 'clipboard', {
			value: {
				write: async (items) => {
					clipboard_data = items[0];
				},
				read: async () => {
					return [clipboard_data];
				}
			}
		});

		// Copy the Unicode content with mock clipboardData
		let copied_html = '';
		let copied_text = '';

		const mock_clipboard_data = {
			setData: (format, data) => {
				if (format === 'text/html') {
					copied_html = data;
				} else if (format === 'text/plain') {
					copied_text = data;
				}
			},
			getData: (format) => {
				if (format === 'text/html') {
					return copied_html;
				} else if (format === 'text/plain') {
					return copied_text;
				}
				return '';
			}
		};

		const copy_event = new ClipboardEvent('copy', {
			bubbles: true,
			cancelable: true
		});

		// Mock the clipboardData property
		Object.defineProperty(copy_event, 'clipboardData', {
			value: mock_clipboard_data,
			writable: false
		});

		const svedit_element = container.querySelector('.svedit-canvas');
		// @ts-ignore
		svedit_element?.focus();
		document.dispatchEvent(copy_event);
		await tick();

		// Verify clipboard data was captured
		expect(copied_html).not.toBe('');

		// Get HTML content and verify Unicode data survived
		const html_content = copied_html;

		// Extract and decode the data using our extraction function
		const extract_svedit_data_from_html = (html) => {
			const svedit_regex = /data-svedit="([^"]+)"/;
			const match = html.match(svedit_regex);

			if (match && match[1]) {
				try {
					const base64_decoded = atob(match[1]);
					const decoded_data = decodeURIComponent(base64_decoded);
					return JSON.parse(decoded_data);
				} catch {
					return null;
				}
			}

			return null;
		};

		const decoded_data = extract_svedit_data_from_html(html_content);
		expect(decoded_data).not.toBeNull();
		expect(decoded_data.nodes[unicode_text_id].content.text).toBe(
			'Hello 🌍 Unicode: café, naïve, 中文, 🚀 test!'
		);

		// Verify that the decoded data contains the correct Unicode content
		expect(decoded_data.nodes[unicode_text_id]).toBeDefined();
		expect(decoded_data.nodes[unicode_text_id].content.text).toBe(
			'Hello 🌍 Unicode: café, naïve, 中文, 🚀 test!'
		);

		// Verify that encoding/decoding preserves Unicode characters perfectly
		expect(decoded_data.main_nodes).toContain(unicode_text_id);
	});
});
