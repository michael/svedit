import { describe, it, expect } from 'vitest';
import create_test_doc from './create_test_doc.js';

describe('Document.svelte.js', () => {
	it('should be traversable', () => {
		const doc = create_test_doc();

		// Resolve node by id
		const page_1 = doc.get('page_1');
		expect(page_1.id).toBe('page_1');
		expect(page_1.type).toBe('page');

		// Resolve node_array property
		const body = doc.get(['page_1', 'body']);
		expect(body).toEqual(['story_1', 'story_1', 'list_1']);

		// Access an element of a node_array property
		const first_story = doc.get(['page_1', 'body', 0]);
		expect(first_story.id).toBe('story_1');
		expect(first_story.type).toBe('story');

		// Resolve annotated_text property
		const fist_story_title = doc.get(['page_1', 'body', 0, 'title']);
		expect(fist_story_title).toEqual({ text: 'First story', annotations: [] });

		// Resolve integer_array
		const daily_visitors = doc.get(['page_1', 'daily_visitors']);
		expect(daily_visitors).toEqual([10, 20, 30, 100]);

		// Resolve integer_array element
		const daily_visitors_first_day = doc.get(['page_1', 'daily_visitors', 1]);
		expect(daily_visitors_first_day).toBe(20);

		// Resolve string_array
		const keywords = doc.get(['page_1', 'keywords']);
		expect(keywords).toEqual(['svelte', 'editor', 'rich content']);

		// Resolve string_array element
		const first_keyword = doc.get(['page_1', 'keywords', 2]);
		expect(first_keyword).toBe('rich content');

		// Resolve hierarchy using node_array
		const list_items_of_first_list = doc.get(['page_1', 'body', 2, 'list_items']);
		expect(list_items_of_first_list).toEqual(['list_item_1', 'list_item_2']);

		// Resolve hierarchy using node_array and accessing an annotated_text property
		const first_list_item_content = doc.get(['page_1', 'body', 2, 'list_items', 0, 'content']);
		expect(first_list_item_content).toEqual({ text: 'first list item', annotations: [] });
	});

	describe('Deletion scenarios', () => {
		it('should delete unreferenced nodes and their children when deleting from node_array', () => {
			const doc = create_test_doc();

			// Initial state: body has ['story_1, 'story_1, 'list_1]
			expect(doc.get(['page_1', 'body'])).toEqual(['story_1', 'story_1', 'list_1']);
			expect(doc.get('list_1')).toBeDefined();
			expect(doc.get('list_item_1')).toBeDefined();
			expect(doc.get('list_item_2')).toBeDefined();

			// Delete the list (index 2) - it has no other references
			doc.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 2,
				focus_offset: 3
			};

			const tr = doc.tr;
			tr.delete_selection();
			doc.apply(tr);

			// Body should no longer contain the list
			expect(doc.get(['page_1', 'body'])).toEqual(['story_1', 'story_1']);

			// List and its children should be deleted since no other references exist
			expect(doc.get('list_1')).toBeUndefined();
			expect(doc.get('list_item_1')).toBeUndefined();
			expect(doc.get('list_item_2')).toBeUndefined();
		});

		it('should only remove reference when deleting multiply-referenced nodes', () => {
			const doc = create_test_doc();

			// Initial state: story is referenced twice
			expect(doc.get(['page_1', 'body'])).toEqual(['story_1', 'story_1', 'list_1']);
			expect(doc.get('story_1')).toBeDefined();

			// Delete first story reference (index 0)
			doc.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 1
			};

			const tr = doc.tr;
			tr.delete_selection();
			doc.apply(tr);

			// Body should only have one story reference now
			expect(doc.get(['page_1', 'body'])).toEqual(['story_1', 'list_1']);

			// Story node should still exist since it's still referenced
			expect(doc.get('story_1')).toBeDefined();
		});

		it('should delete nodes when all references are removed', () => {
			const doc = create_test_doc();

			// Initial state: story is referenced twice
			expect(doc.get(['page_1', 'body'])).toEqual(['story_1', 'story_1', 'list_1']);
			expect(doc.get('story_1')).toBeDefined();

			// Delete both story references (index 0 and 1)
			doc.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 2
			};

			const tr = doc.tr;
			tr.delete_selection();
			doc.apply(tr);

			// Body should only contain the list
			expect(doc.get(['page_1', 'body'])).toEqual(['list_1']);

			// Story node should be deleted since no references remain
			expect(doc.get('story_1')).toBeUndefined();
		});

		it('should properly restore deleted nodes and references on undo', () => {
			const doc = create_test_doc();

			// Delete the list
			doc.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 2,
				focus_offset: 3
			};

			const tr = doc.tr;
			tr.delete_selection();
			doc.apply(tr);

			// Verify deletion
			expect(doc.get(['page_1', 'body'])).toEqual(['story_1', 'story_1']);
			expect(doc.get('list_1')).toBeUndefined();
			expect(doc.get('list_item_1')).toBeUndefined();
			expect(doc.get('list_item_2')).toBeUndefined();

			// Undo the deletion
			doc.undo();

			// Everything should be restored
			expect(doc.get(['page_1', 'body'])).toEqual(['story_1', 'story_1', 'list_1']);
			expect(doc.get('list_1')).toBeDefined();
			expect(doc.get('list_item_1')).toBeDefined();
			expect(doc.get('list_item_2')).toBeDefined();
			expect(doc.get('list_1').list_items).toEqual(['list_item_1', 'list_item_2']);
		});

		it('should handle complex nested deletion scenarios', () => {
			const doc = create_test_doc();

			// Delete one story reference first
			doc.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 1
			};

			let tr = doc.tr;
			tr.delete_selection();
			doc.apply(tr);

			expect(doc.get(['page_1', 'body'])).toEqual(['story_1', 'list_1']);
			expect(doc.get('story_1')).toBeDefined(); // Should still exist

			// Now delete the remaining story and list
			doc.selection = {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 2
			};

			tr = doc.tr;
			tr.delete_selection();
			doc.apply(tr);

			expect(doc.get(['page_1', 'body'])).toEqual([]);
			expect(doc.get('story_1')).toBeUndefined(); // Now should be deleted
			expect(doc.get('list_1')).toBeUndefined();
			expect(doc.get('list_item_1')).toBeUndefined();
			expect(doc.get('list_item_2')).toBeUndefined();
		});
	});
});
