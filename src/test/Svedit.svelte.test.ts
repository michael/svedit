import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import SveditTestWithInput from './testing_components/SveditTestWithInput.svelte';
import create_test_session from './create_test_session.js';
import { join_text_node } from '../lib/transforms.svelte.js';
import nanoid from '../routes/nanoid.js';

describe('Svedit.svelte', () => {
	it('restores an unchanged property selection without scrolling', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });
		await tick();
		const canvas = container.querySelector('.svedit-canvas') as HTMLElement;
		const scroll_into_view = vi.spyOn(Element.prototype, 'scrollIntoView');

		try {
			canvas.focus();
			session.selection = {
				type: 'property',
				path: ['page_1', 'body', 0, 'image']
			};
			await tick();
			await new Promise((resolve) => setTimeout(resolve, 10));
			scroll_into_view.mockClear();

			// Applying a transaction creates a fresh selection reference, even
			// when the logical selection is unchanged.
			session.apply(session.tr);
			await tick();
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(window.getSelection()?.rangeCount).toBe(1);
			expect(scroll_into_view).not.toHaveBeenCalled();
		} finally {
			scroll_into_view.mockRestore();
		}
	});

	it('does not throw when focus leaves the canvas before deferred text-selection scroll runs', async () => {
		const session = create_test_session();
		const errors = [];
		const on_error = (event) => {
			if (String(event.error?.message ?? event.message).includes('parentElement')) {
				errors.push(event.error ?? event.message);
				event.preventDefault();
			}
		};
		window.addEventListener('error', on_error);

		try {
			const { container } = render(SveditTestWithInput, { session });
			const canvas = container.querySelector('.svedit-canvas') as HTMLElement;
			const input = container.querySelector('[data-testid="external-input"]') as HTMLInputElement;

			canvas.focus();
			await tick();

			session.selection = {
				type: 'text',
				path: ['page_1', 'body', 0, 'title'],
				anchor_offset: 0,
				focus_offset: 5
			};
			await tick();

			input.focus();
			window.getSelection()?.removeAllRanges();
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(errors).toEqual([]);
		} finally {
			window.removeEventListener('error', on_error);
		}
	});

	it('should map node caret to DOM', async () => {
		const session = create_test_session();

		const { container } = render(SveditTest, { session });

		// Focus the canvas first so render_selection() runs when selection is set
		const svedit_element = container.querySelector('.svedit-canvas') as HTMLElement;
		svedit_element?.focus();
		await tick();

		// Now set node caret between first and second node
		session.selection = {
			type: 'node',
			path: [session.doc.document_id, 'body'],
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
	});

	it('should map property selection to DOM', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });

		// Focus the canvas first so render_selection() runs when selection is set
		const svedit_element = container.querySelector('.svedit-canvas') as HTMLElement;
		svedit_element?.focus();
		await tick();

		// Now set property selection
		session.selection = {
			type: 'property',
			path: [session.doc.document_id, 'body', 0, 'image']
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
		const session = create_test_session();
		const { container } = render(SveditTest, { session });

		// Focus the canvas first so render_selection() runs when selection is set
		const svedit_element = container.querySelector('.svedit-canvas') as HTMLElement;
		svedit_element?.focus();
		await tick();

		// Get the original story and button content
		const original_story = session.get('story_1');
		const original_button = session.get('button_1');

		expect(original_story.title).toEqual({ content: 'First story', marks: [], annotations: [] });
		expect(original_story.buttons.nodes).toEqual(['button_1']);
		expect(original_button.content).toEqual({ content: 'Get started', marks: [], annotations: [] });

		// Initial body state: ['story_1, 'story_1, 'list_1]
		const initial_body = session.get(['page_1', 'body']);
		expect(initial_body.nodes).toEqual(['story_1', 'story_1', 'list_1']);

		// Set selection to the first story node
		session.selection = {
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

		document.dispatchEvent(copy_event);
		await tick();

		// Verify something was copied
		expect(copied_html).not.toBe('');

		// Keep same selection for paste (to replace, not insert)
		session.selection = {
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
		const body_after_first_paste = session.get(['page_1', 'body']);
		expect(body_after_first_paste.nodes.length).toBe(3);

		// Get the new story ID (first element should be the replaced one)
		const first_new_story_id = body_after_first_paste.nodes[0];
		const first_new_story = session.get(first_new_story_id);
		const first_new_button_id = first_new_story.buttons.nodes[0];
		const first_new_button = session.get(first_new_button_id);

		// Content should be the same as original
		expect(first_new_story.title).toEqual({ content: 'First story', marks: [], annotations: [] });
		expect(first_new_story.description).toEqual({
			content: 'First story description.',
			marks: [],
			annotations: []
		});
		expect(first_new_button.content).toEqual({
			content: 'Get started',
			marks: [],
			annotations: []
		});
		expect(first_new_button.href).toBe('https://github.com/michael/svedit');

		// But IDs should be different
		expect(first_new_story_id).not.toBe('story_1');
		expect(first_new_button_id).not.toBe('button_1');
		expect(first_new_story.buttons.nodes).toEqual([first_new_button_id]);

		// Keep same selection for second paste (to replace again)
		session.selection = {
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
		const body_after_second_paste = session.get(['page_1', 'body']);
		expect(body_after_second_paste.nodes.length).toBe(3);

		// Get the second new story ID (first element should be the second replacement)
		const second_new_story_id = body_after_second_paste.nodes[0];
		const second_new_story = session.get(second_new_story_id);
		const second_new_button_id = second_new_story.buttons.nodes[0];
		const second_new_button = session.get(second_new_button_id);

		// Content should still be the same
		expect(second_new_story.title).toEqual({ content: 'First story', marks: [], annotations: [] });
		expect(second_new_story.description).toEqual({
			content: 'First story description.',
			marks: [],
			annotations: []
		});
		expect(second_new_button.content).toEqual({
			content: 'Get started',
			marks: [],
			annotations: []
		});
		expect(second_new_button.href).toBe('https://github.com/michael/svedit');

		// But IDs should be different from both original and first paste
		expect(second_new_story_id).not.toBe('story_1');
		expect(second_new_story_id).not.toBe(first_new_story_id);
		expect(second_new_button_id).not.toBe('button_1');
		expect(second_new_button_id).not.toBe(first_new_button_id);
		expect(second_new_story.buttons.nodes).toEqual([second_new_button_id]);

		// Verify the first paste's nodes no longer exist (they were replaced)
		expect(session.get(first_new_story_id)).toBeUndefined();
		expect(session.get(first_new_button_id)).toBeUndefined();

		// But the current (second) paste nodes exist
		expect(session.get(second_new_story_id)).toBeDefined();
		expect(session.get(second_new_button_id)).toBeDefined();

		// Original nodes should still exist (at position 1)
		expect(session.get('story_1')).toBeDefined();
		expect(session.get('button_1')).toBeDefined();
		expect(body_after_second_paste.nodes[1]).toBe('story_1');
	});

	describe('join_text_node command', () => {
		it('should delete empty text node when trying to join with non-text predecessor', () => {
			const session = create_test_session();

			// Create an empty text node after a story
			const empty_text_id = nanoid();
			const empty_text_node = {
				id: empty_text_id,
				type: 'paragraph',
				content: { content: '', marks: [], annotations: [] } // Empty content
			};

			const tr = session.tr;
			tr.create(empty_text_node);

			// Insert the empty text node after the first story
			const body = session.get(['page_1', 'body']);
			const new_body = [body.nodes[0], empty_text_id, ...body.nodes.slice(1)];
			tr.set(['page_1', 'body'], { ...body, nodes: new_body });
			session.apply(tr);

			// Set text selection in the empty text node (position 1 in body)
			session.selection = {
				type: 'text',
				path: ['page_1', 'body', 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			};

			// Apply join_text_node command
			const join_tr = session.tr;
			join_text_node(join_tr);
			session.apply(join_tr);

			// Empty text node should be deleted
			expect(session.get(empty_text_id)).toBeUndefined();

			// Body should be back to original state
			const final_body = session.get(['page_1', 'body']);
			expect(final_body.nodes).toEqual(['story_1', 'story_1', 'list_1']);

			// Selection should be at position 1 (where the deleted node was)
			expect(session.selection.type).toBe('node');
			expect(session.selection.anchor_offset).toBe(1);
			expect(session.selection.focus_offset).toBe(1);
		});

		it('should do nothing when trying to join non-empty text node with non-text predecessor', () => {
			const session = create_test_session();

			// Create a non-empty text node after a story
			const text_id = nanoid();
			const text_node = {
				id: text_id,
				type: 'paragraph',
				content: { content: 'Some content', marks: [], annotations: [] }
			};

			const tr = session.tr;
			tr.create(text_node);

			// Insert the text node after the first story
			const body = session.get(['page_1', 'body']);
			const new_body = [body.nodes[0], text_id, ...body.nodes.slice(1)];
			tr.set(['page_1', 'body'], { ...body, nodes: new_body });
			session.apply(tr);

			// Set text selection in the text node (position 1 in body)
			session.selection = {
				type: 'text',
				path: ['page_1', 'body', 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			};

			// Apply join_text_node command
			const join_tr = session.tr;
			const result = join_text_node(join_tr);

			// Should return false (no action taken)
			expect(result).toBe(false);

			// Text node should still exist
			expect(session.get(text_id)).toBeDefined();
			expect(session.get(text_id).content).toEqual({
				content: 'Some content',
				marks: [],
				annotations: []
			});

			// Body should remain unchanged
			const final_body = session.get(['page_1', 'body']);
			expect(final_body.nodes).toEqual(['story_1', text_id, 'story_1', 'list_1']);
		});

		it('should delete empty text node at position 0', () => {
			const session = create_test_session();

			// Create an empty text node and put it at the beginning
			const empty_text_id = nanoid();
			const empty_text_node = {
				id: empty_text_id,
				type: 'paragraph',
				content: { content: '', marks: [], annotations: [] } // Empty content
			};

			const tr = session.tr;
			tr.create(empty_text_node);

			// Insert the empty text node at the beginning
			const body = session.get(['page_1', 'body']);
			const new_body = [empty_text_id, ...body.nodes];
			tr.set(['page_1', 'body'], { ...body, nodes: new_body });
			session.apply(tr);

			// Set text selection in the empty text node (position 0 in body)
			session.selection = {
				type: 'text',
				path: ['page_1', 'body', 0, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			};

			// Apply join_text_node command
			const join_tr = session.tr;
			join_text_node(join_tr);
			session.apply(join_tr);

			// Empty text node should be deleted
			expect(session.get(empty_text_id)).toBeUndefined();

			// Body should be back to original state
			const final_body = session.get(['page_1', 'body']);
			expect(final_body.nodes).toEqual(['story_1', 'story_1', 'list_1']);

			// Selection should be at position 0
			expect(session.selection.type).toBe('node');
			expect(session.selection.anchor_offset).toBe(0);
			expect(session.selection.focus_offset).toBe(0);
		});

		it('should do nothing when non-empty text node is at position 0', () => {
			const session = create_test_session();

			// Create a non-empty text node and put it at the beginning
			const text_id = nanoid();
			const text_node = {
				id: text_id,
				type: 'paragraph',
				content: { content: 'Some content', marks: [], annotations: [] }
			};

			const tr = session.tr;
			tr.create(text_node);

			// Insert the text node at the beginning
			const body = session.get(['page_1', 'body']);
			const new_body = [text_id, ...body.nodes];
			tr.set(['page_1', 'body'], { ...body, nodes: new_body });
			session.apply(tr);

			// Set text selection in the text node (position 0 in body)
			session.selection = {
				type: 'text',
				path: ['page_1', 'body', 0, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			};

			// Apply join_text_node command
			const join_tr = session.tr;
			const result = join_text_node(join_tr);

			// Should return false (no action taken)
			expect(result).toBe(false);

			// Text node should still exist
			expect(session.get(text_id)).toBeDefined();
			expect(session.get(text_id).content).toEqual({
				content: 'Some content',
				marks: [],
				annotations: []
			});

			// Body should remain unchanged
			const final_body = session.get(['page_1', 'body']);
			expect(final_body.nodes).toEqual([text_id, 'story_1', 'story_1', 'list_1']);
		});

		it('should join two text nodes and position caret at end of joined text', () => {
			const session = create_test_session();

			// Create two text nodes
			const first_text_id = nanoid();
			const second_text_id = nanoid();

			const first_text_node = {
				id: first_text_id,
				type: 'paragraph',
				content: { content: 'First text', marks: [], annotations: [] }
			};

			const second_text_node = {
				id: second_text_id,
				type: 'paragraph',
				content: { content: ' second text', marks: [], annotations: [] }
			};

			const tr = session.tr;
			tr.create(first_text_node);
			tr.create(second_text_node);

			// Replace body with our two text nodes
			tr.set(['page_1', 'body'], {
				nodes: [first_text_id, second_text_id],
				marks: [],
				annotations: []
			});
			session.apply(tr);

			// Set text selection in the second text node
			session.selection = {
				type: 'text',
				path: ['page_1', 'body', 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			};

			// Apply join_text_node command
			const join_tr = session.tr;
			join_text_node(join_tr);
			session.apply(join_tr);

			// Second text node should be deleted
			expect(session.get(second_text_id)).toBeUndefined();

			// First text node should contain joined content
			const first_text = session.get(first_text_id);
			expect(first_text.content).toEqual({
				content: 'First text second text',
				marks: [],
				annotations: []
			});

			// Body should only contain the first text node
			const final_body = session.get(['page_1', 'body']);
			expect(final_body.nodes).toEqual([first_text_id]);

			// Selection should be positioned at the end of the original first text
			expect(session.selection.type).toBe('text');
			expect(session.selection.path).toEqual(['page_1', 'body', 0, 'content']);
			expect(session.selection.anchor_offset).toBe(10); // Length of "First text"
			expect(session.selection.focus_offset).toBe(10);
		});
	});

	it('should encode and decode svedit data in HTML clipboard format', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });

		// Focus the canvas first so render_selection() runs when selection is set
		const svedit_element = container.querySelector('.svedit-canvas') as HTMLElement;
		svedit_element?.focus();
		await tick();

		// Select a story node to copy
		session.selection = {
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
		session.selection = {
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
		const body_after_paste = session.get(['page_1', 'body']);
		expect(body_after_paste.nodes).toHaveLength(4);
	});

	it('should handle Unicode characters in clipboard data', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });

		// Focus the canvas first so render_selection() runs when selection is set
		const svedit_element = container.querySelector('.svedit-canvas') as HTMLElement;
		svedit_element?.focus();
		await tick();

		// Create a text node with Unicode characters (emojis, special chars)
		const unicode_text_id = nanoid();
		const unicode_text_node = {
			id: unicode_text_id,
			type: 'paragraph',
			content: {
				content: 'Hello 🌍 Unicode: café, naïve, 中文, 🚀 test!',
				marks: [],
				annotations: []
			}
		};

		const tr = session.tr;
		tr.create(unicode_text_node);

		// Insert the text node at the beginning
		const body = session.get(['page_1', 'body']);
		const new_body = [unicode_text_id, ...body.nodes];
		tr.set(['page_1', 'body'], { ...body, nodes: new_body });
		session.apply(tr);

		// Select the Unicode text node
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};

		await tick();

		// Mock clipboard API
		let clipboard_data = null as ClipboardItem | null;
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
		expect(decoded_data.nodes[unicode_text_id].content.content).toBe(
			'Hello 🌍 Unicode: café, naïve, 中文, 🚀 test!'
		);

		// Verify that the decoded data contains the correct Unicode content
		expect(decoded_data.nodes[unicode_text_id]).toBeDefined();
		expect(decoded_data.nodes[unicode_text_id].content.content).toBe(
			'Hello 🌍 Unicode: café, naïve, 中文, 🚀 test!'
		);

		// Verify that encoding/decoding preserves Unicode characters perfectly
		expect(decoded_data.main_nodes).toContain(unicode_text_id);
	});

	async function dispatch_plain_text_paste(plain_text) {
		const paste_event = new ClipboardEvent('paste', {
			bubbles: true,
			cancelable: true
		});
		const mock_clipboard_data = {
			items: [],
			getData: (format) => {
				if (format === 'text/plain') return plain_text;
				return '';
			}
		};
		Object.defineProperty(paste_event, 'clipboardData', {
			value: mock_clipboard_data,
			writable: false
		});
		document.dispatchEvent(paste_event);
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	it('should split multi-paragraph plain text into text nodes when selection is inside a text node', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });
		const svedit_element = container.querySelector('.svedit-canvas') as HTMLElement;
		svedit_element?.focus();
		await tick();

		const tr = session.tr;
		const text_id = nanoid();
		tr.create({
			id: text_id,
			type: 'paragraph',
			content: { content: '', marks: [], annotations: [] }
		});
		const body_before_insert = session.get(['page_1', 'body']);
		tr.set(['page_1', 'body'], {
			...body_before_insert,
			nodes: [...body_before_insert.nodes, text_id]
		});
		session.apply(tr);

		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 3, 'content'],
			anchor_offset: 0,
			focus_offset: 0
		};
		await tick();

		await dispatch_plain_text_paste('alpha\n\nbeta\n\ngamma');

		const body = session.get(['page_1', 'body']);
		expect(body.nodes).toHaveLength(7);
		expect(session.get(body.nodes[3]).content.content).toBe('');
		expect(session.get(body.nodes[4]).content.content).toBe('alpha');
		expect(session.get(body.nodes[5]).content.content).toBe('beta');
		expect(session.get(body.nodes[6]).content.content).toBe('gamma');
	});

	it('should paste multi-paragraph plain text as-is into a block text property with allow_newlines=true', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });
		const svedit_element = container.querySelector('.svedit-canvas') as HTMLElement;
		svedit_element?.focus();
		await tick();

		const description_text = session.get('story_1').description.content;
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'description'],
			anchor_offset: 0,
			focus_offset: description_text.length
		};
		await tick();

		await dispatch_plain_text_paste('line one\n\nline two');

		expect(session.get('story_1').description.content).toBe('line one\n\nline two');
		expect(session.get(['page_1', 'body']).nodes).toHaveLength(3);
	});

	it('should dedent plain text when most lines share leading whitespace', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });
		const svedit_element = container.querySelector('.svedit-canvas') as HTMLElement;
		svedit_element?.focus();
		await tick();

		const description_text = session.get('story_1').description.content;
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'description'],
			anchor_offset: 0,
			focus_offset: description_text.length
		};
		await tick();

		await dispatch_plain_text_paste('\tlet first = 1;\n\tlet second = 2;\n\tlet third = 3;');

		expect(session.get('story_1').description.content).toBe(
			'let first = 1;\nlet second = 2;\nlet third = 3;'
		);
	});

	it('should normalize newlines to single spaces in block text properties with allow_newlines=false', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });
		const svedit_element = container.querySelector('.svedit-canvas') as HTMLElement;
		svedit_element?.focus();
		await tick();

		const title_text = session.get('story_1').title.content;
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'title'],
			anchor_offset: 0,
			focus_offset: title_text.length
		};
		await tick();

		await dispatch_plain_text_paste('hello\n\n   world\nagain');

		expect(session.get('story_1').title.content).toBe('hello world again');
		expect(session.get(['page_1', 'body']).nodes).toHaveLength(3);
	});

	it('should paste plain text from a property selection by inserting text nodes into the nearest node_array', async () => {
		const session = create_test_session();
		const { container } = render(SveditTest, { session });
		const svedit_element = container.querySelector('.svedit-canvas') as HTMLElement;
		svedit_element?.focus();
		await tick();

		session.selection = {
			type: 'property',
			path: ['page_1', 'body', 0, 'image']
		};
		await tick();

		await dispatch_plain_text_paste('inserted one\n\ninserted two');

		const body = session.get(['page_1', 'body']);
		expect(body.nodes).toHaveLength(5);
		expect(session.kind(session.get(body.nodes[1]))).toBe('text');
		expect(session.kind(session.get(body.nodes[2]))).toBe('text');
		expect(session.get(body.nodes[1]).content.content).toBe('inserted one');
		expect(session.get(body.nodes[2]).content.content).toBe('inserted two');
	});
});
