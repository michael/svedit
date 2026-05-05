import { describe, it, expect } from 'vitest';
import Session from '../lib/Session.svelte.js';
import { deserialize_path, serialize_path } from '../lib/utils.js';
import create_test_session from './create_test_session.js';

describe('path serialization', () => {
	it('should preserve string and number path segment semantics', () => {
		const path = ['page_1', 'body', 0, 'items'];
		const serialized_path = serialize_path(path);

		expect(serialized_path).toBe('page_1__body__0__items');
		expect(deserialize_path(serialized_path)).toEqual(path);
	});

	it('should reject path string segments that cannot be represented in the unified format', () => {
		expect(() => serialize_path(['page.1'])).toThrow('Path segment');
		expect(() => serialize_path(['page__1'])).toThrow('Path segment');
		expect(() => serialize_path(['1_page'])).toThrow('Path segment');
	});
});

describe('schema path segment validation', () => {
	it('should throw when schema property names cannot be represented in the unified path format', () => {
		expect(
			() =>
				new Session(
					{
						page: {
							kind: 'document',
							properties: {
								'bad.property': { type: 'string' }
							}
						}
					},
					{
						document_id: 'page_1',
						nodes: {
							page_1: {
								id: 'page_1',
								type: 'page',
								'bad.property': ''
							}
						}
					},
					{}
				)
		).toThrow('Property name');
	});
});

describe('Session.svelte.js', () => {
	it('should be traversable', () => {
		const session = create_test_session();

		// Resolve node by id
		const page_1 = session.get('page_1');
		expect(page_1.id).toBe('page_1');
		expect(page_1.type).toBe('page');

		// Resolve node_array property
		const body = session.get(['page_1', 'body']);
		expect(body).toEqual(['story_1', 'story_1', 'list_1']);

		// Access an element of a node_array property
		const first_story = session.get(['page_1', 'body', 0]);
		expect(first_story.id).toBe('story_1');
		expect(first_story.type).toBe('story');

		// Resolve annotated_text property
		const fist_story_title = session.get(['page_1', 'body', 0, 'title']);
		expect(fist_story_title).toEqual({ text: 'First story', annotations: [] });

		// Resolve integer_array
		const daily_visitors = session.get(['page_1', 'daily_visitors']);
		expect(daily_visitors).toEqual([10, 20, 30, 100]);

		// Resolve integer_array element
		const daily_visitors_first_day = session.get(['page_1', 'daily_visitors', 1]);
		expect(daily_visitors_first_day).toBe(20);

		// Resolve string_array
		const keywords = session.get(['page_1', 'keywords']);
		expect(keywords).toEqual(['svelte', 'editor', 'rich content']);

		// Resolve string_array element
		const first_keyword = session.get(['page_1', 'keywords', 2]);
		expect(first_keyword).toBe('rich content');

		// Resolve hierarchy using node_array
		const list_items_of_first_list = session.get(['page_1', 'body', 2, 'list_items']);
		expect(list_items_of_first_list).toEqual(['list_item_1', 'list_item_2']);

		// Resolve hierarchy using node_array and accessing an annotated_text property
		const first_list_item_content = session.get(['page_1', 'body', 2, 'list_items', 0, 'content']);
		expect(first_list_item_content).toEqual({ text: 'first list item', annotations: [] });
	});

	describe('Path inspection', () => {
		it('should report node and property kinds correctly', () => {
			const session = create_test_session();

			const page_info = session.inspect(['page_1']);
			expect(page_info.kind).toBe('node');
			expect(page_info.type).toBe('page');

			const body_info = session.inspect(['page_1', 'body']);
			expect(body_info.kind).toBe('property');
			expect(body_info.type).toBe('node_array');

			const story_info = session.inspect(['page_1', 'body', 0]);
			expect(story_info.kind).toBe('node');
			expect(story_info.type).toBe('story');

			const title_info = session.inspect(['page_1', 'body', 0, 'title']);
			expect(title_info.kind).toBe('property');
			expect(title_info.type).toBe('annotated_text');
		});
	});

	describe('Node id validation', () => {
		it('should throw when creating a node with an id that starts with a number', () => {
			const session = create_test_session();
			const tr = session.tr;

			expect(() =>
				tr.create({
					id: '1_invalid_node',
					type: 'text',
					layout: 1,
					content: { text: 'Invalid node', annotations: [] }
				})
			).toThrow('invalid id');
		});
	});

	describe('Transaction.set path validation', () => {
		it('should throw when set is called with a node path instead of a property path', () => {
			const session = create_test_session();
			const tr = session.tr;

			expect(() =>
				tr.set(['story_1'], {
					...session.get('story_1'),
					layout: 2
				})
			).toThrow('Transaction.set requires a path that points to a property');
		});
	});

	describe('Deletion scenarios', () => {
		it('should delete unreferenced nodes and their children when deleting from node_array', () => {
			const session = create_test_session();

			// Initial state: body has ['story_1, 'story_1, 'list_1]
			expect(session.get(['page_1', 'body'])).toEqual(['story_1', 'story_1', 'list_1']);
			expect(session.get('list_1')).toBeDefined();
			expect(session.get('list_item_1')).toBeDefined();
			expect(session.get('list_item_2')).toBeDefined();

			// Delete the list (index 2) - it has no other references
			session.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 2,
				focus_offset: 3
			};

			const tr = session.tr;
			tr.delete_selection();
			session.apply(tr);

			// Body should no longer contain the list
			expect(session.get(['page_1', 'body'])).toEqual(['story_1', 'story_1']);

			// List and its children should be deleted since no other references exist
			expect(session.get('list_1')).toBeUndefined();
			expect(session.get('list_item_1')).toBeUndefined();
			expect(session.get('list_item_2')).toBeUndefined();
		});

		it('should only remove reference when deleting multiply-referenced nodes', () => {
			const session = create_test_session();

			// Initial state: story is referenced twice
			expect(session.get(['page_1', 'body'])).toEqual(['story_1', 'story_1', 'list_1']);
			expect(session.get('story_1')).toBeDefined();

			// Delete first story reference (index 0)
			session.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 1
			};

			const tr = session.tr;
			tr.delete_selection();
			session.apply(tr);

			// Body should only have one story reference now
			expect(session.get(['page_1', 'body'])).toEqual(['story_1', 'list_1']);

			// Story node should still exist since it's still referenced
			expect(session.get('story_1')).toBeDefined();
		});

		it('should delete nodes when all references are removed', () => {
			const session = create_test_session();

			// Initial state: story is referenced twice
			expect(session.get(['page_1', 'body'])).toEqual(['story_1', 'story_1', 'list_1']);
			expect(session.get('story_1')).toBeDefined();

			// Delete both story references (index 0 and 1)
			session.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 2
			};

			const tr = session.tr;
			tr.delete_selection();
			session.apply(tr);

			// Body should only contain the list
			expect(session.get(['page_1', 'body'])).toEqual(['list_1']);

			// Story node should be deleted since no references remain
			expect(session.get('story_1')).toBeUndefined();
		});

		it('should properly restore deleted nodes and references on undo', () => {
			const session = create_test_session();

			// Delete the list
			session.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 2,
				focus_offset: 3
			};

			const tr = session.tr;
			tr.delete_selection();
			session.apply(tr);

			// Verify deletion
			expect(session.get(['page_1', 'body'])).toEqual(['story_1', 'story_1']);
			expect(session.get('list_1')).toBeUndefined();
			expect(session.get('list_item_1')).toBeUndefined();
			expect(session.get('list_item_2')).toBeUndefined();

			// Undo the deletion
			session.undo();

			// Everything should be restored
			expect(session.get(['page_1', 'body'])).toEqual(['story_1', 'story_1', 'list_1']);
			expect(session.get('list_1')).toBeDefined();
			expect(session.get('list_item_1')).toBeDefined();
			expect(session.get('list_item_2')).toBeDefined();
			expect(session.get('list_1').list_items).toEqual(['list_item_1', 'list_item_2']);
		});

		it('should handle complex nested deletion scenarios', () => {
			const session = create_test_session();

			// Delete one story reference first
			session.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 1
			};

			let tr = session.tr;
			tr.delete_selection();
			session.apply(tr);

			expect(session.get(['page_1', 'body'])).toEqual(['story_1', 'list_1']);
			expect(session.get('story_1')).toBeDefined(); // Should still exist

			// Now delete the remaining story and list
			session.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 2
			};

			tr = session.tr;
			tr.delete_selection();
			session.apply(tr);

			expect(session.get(['page_1', 'body'])).toEqual([]);
			expect(session.get('story_1')).toBeUndefined(); // Now should be deleted
			expect(session.get('list_1')).toBeUndefined();
			expect(session.get('list_item_1')).toBeUndefined();
			expect(session.get('list_item_2')).toBeUndefined();
		});
	});
});
