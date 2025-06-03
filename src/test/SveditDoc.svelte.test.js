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

    // Resolve annotated_text property
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

    // Resolve hierarchy using multiref and accessing an annotated_text property
    const first_list_item_content = doc.get([page_1_id, 'body', 2, 'list_items', 0, 'content']);
    expect(first_list_item_content).toEqual(['first list item', []]);
  });
});