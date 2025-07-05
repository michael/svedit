import { describe, it, expect } from 'vitest';
import {
  create_test_doc,
  story_1_id,
  page_1_id,
  list_1_id,
  list_item_1_id,
  list_item_2_id
} from './create_test_doc.js';

describe('SveditDoc.svelte.js', () => {
  it('should be traversable', () => {
    const doc = create_test_doc();

    // Resolve node by id
    const page_1 = doc.get(page_1_id);
    expect(page_1.id).toBe(page_1_id);
    expect(page_1.type).toBe('page');

    // Resolve multiref property
    const body = doc.get([page_1_id, 'body']);
    expect(body).toEqual([story_1_id, story_1_id, list_1_id]);

    // Access an element of a multiref property
    const first_story = doc.get([page_1_id, 'body', 0]);
    expect(first_story.id).toBe(story_1_id);
    expect(first_story.type).toBe('story');

    // Resolve annotated_string property
    const fist_story_title = doc.get([page_1_id, 'body', 0, 'title']);
    expect(fist_story_title).toEqual(['First story', []]);

    // Resolve integer_array
    const daily_visitors = doc.get([page_1_id, 'daily_visitors']);
    expect(daily_visitors).toEqual([10, 20, 30, 100]);

    // Resolve integer_array element
    const daily_visitors_first_day = doc.get([page_1_id, 'daily_visitors', 1]);
    expect(daily_visitors_first_day).toBe(20);

    // Resolve string_array
    const keywords = doc.get([page_1_id, 'keywords']);
    expect(keywords).toEqual(['svelte', 'editor', 'rich content']);

    // Resolve string_array element
    const first_keyword = doc.get([page_1_id, 'keywords', 2]);
    expect(first_keyword).toBe('rich content');

    // Resolve hierarchy using multiref
    const list_items_of_first_list = doc.get([page_1_id, 'body', 2, 'list_items']);
    expect(list_items_of_first_list).toEqual([list_item_1_id, list_item_2_id]);

    // Resolve hierarchy using multiref and accessing an annotated_string property
    const first_list_item_content = doc.get([page_1_id, 'body', 2, 'list_items', 0, 'content']);
    expect(first_list_item_content).toEqual(['first list item', []]);
  });

  describe('Deletion scenarios', () => {
    it('should delete unreferenced nodes and their children when deleting from container', () => {
      const doc = create_test_doc();

      // Initial state: body has [story_1_id, story_1_id, list_1_id]
      expect(doc.get([page_1_id, 'body'])).toEqual([story_1_id, story_1_id, list_1_id]);
      expect(doc.get(list_1_id)).toBeDefined();
      expect(doc.get(list_item_1_id)).toBeDefined();
      expect(doc.get(list_item_2_id)).toBeDefined();

      // Delete the list (index 2) - it has no other references
      doc.selection = {
        type: 'container',
        path: [page_1_id, 'body'],
        anchor_offset: 2,
        focus_offset: 3
      };

      const tr = doc.tr;
      tr.delete_selection();
      doc.apply(tr);

      // Body should no longer contain the list
      expect(doc.get([page_1_id, 'body'])).toEqual([story_1_id, story_1_id]);

      // List and its children should be deleted since no other references exist
      expect(doc.get(list_1_id)).toBeUndefined();
      expect(doc.get(list_item_1_id)).toBeUndefined();
      expect(doc.get(list_item_2_id)).toBeUndefined();
    });

    it('should only remove reference when deleting multiply-referenced nodes', () => {
      const doc = create_test_doc();

      // Initial state: story is referenced twice
      expect(doc.get([page_1_id, 'body'])).toEqual([story_1_id, story_1_id, list_1_id]);
      expect(doc.get(story_1_id)).toBeDefined();

      // Delete first story reference (index 0)
      doc.selection = {
        type: 'container',
        path: [page_1_id, 'body'],
        anchor_offset: 0,
        focus_offset: 1
      };

      const tr = doc.tr;
      tr.delete_selection();
      doc.apply(tr);

      // Body should only have one story reference now
      expect(doc.get([page_1_id, 'body'])).toEqual([story_1_id, list_1_id]);

      // Story node should still exist since it's still referenced
      expect(doc.get(story_1_id)).toBeDefined();
    });

    it('should delete nodes when all references are removed', () => {
      const doc = create_test_doc();

      // Initial state: story is referenced twice
      expect(doc.get([page_1_id, 'body'])).toEqual([story_1_id, story_1_id, list_1_id]);
      expect(doc.get(story_1_id)).toBeDefined();

      // Delete both story references (index 0 and 1)
      doc.selection = {
        type: 'container',
        path: [page_1_id, 'body'],
        anchor_offset: 0,
        focus_offset: 2
      };

      const tr = doc.tr;
      tr.delete_selection();
      doc.apply(tr);

      // Body should only contain the list
      expect(doc.get([page_1_id, 'body'])).toEqual([list_1_id]);

      // Story node should be deleted since no references remain
      expect(doc.get(story_1_id)).toBeUndefined();
    });

    it('should properly restore deleted nodes and references on undo', () => {
      const doc = create_test_doc();

      // Delete the list
      doc.selection = {
        type: 'container',
        path: [page_1_id, 'body'],
        anchor_offset: 2,
        focus_offset: 3
      };

      const tr = doc.tr;
      tr.delete_selection();
      doc.apply(tr);

      // Verify deletion
      expect(doc.get([page_1_id, 'body'])).toEqual([story_1_id, story_1_id]);
      expect(doc.get(list_1_id)).toBeUndefined();
      expect(doc.get(list_item_1_id)).toBeUndefined();
      expect(doc.get(list_item_2_id)).toBeUndefined();

      // Undo the deletion
      doc.undo();

      // Everything should be restored
      expect(doc.get([page_1_id, 'body'])).toEqual([story_1_id, story_1_id, list_1_id]);
      expect(doc.get(list_1_id)).toBeDefined();
      expect(doc.get(list_item_1_id)).toBeDefined();
      expect(doc.get(list_item_2_id)).toBeDefined();
      expect(doc.get(list_1_id).list_items).toEqual([list_item_1_id, list_item_2_id]);
    });

    it('should handle complex nested deletion scenarios', () => {
      const doc = create_test_doc();

      // Delete one story reference first
      doc.selection = {
        type: 'container',
        path: [page_1_id, 'body'],
        anchor_offset: 0,
        focus_offset: 1
      };

      let tr = doc.tr;
      tr.delete_selection();
      doc.apply(tr);

      expect(doc.get([page_1_id, 'body'])).toEqual([story_1_id, list_1_id]);
      expect(doc.get(story_1_id)).toBeDefined(); // Should still exist

      // Now delete the remaining story and list
      doc.selection = {
        type: 'container',
        path: [page_1_id, 'body'],
        anchor_offset: 0,
        focus_offset: 2
      };

      tr = doc.tr;
      tr.delete_selection();
      doc.apply(tr);

      expect(doc.get([page_1_id, 'body'])).toEqual([]);
      expect(doc.get(story_1_id)).toBeUndefined(); // Now should be deleted
      expect(doc.get(list_1_id)).toBeUndefined();
      expect(doc.get(list_item_1_id)).toBeUndefined();
      expect(doc.get(list_item_2_id)).toBeUndefined();
    });
  });
});
