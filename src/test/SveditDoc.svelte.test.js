import { describe, it, expect } from 'vitest';
import { svid } from '$lib/util.js';
import SveditDoc from '$lib/SveditDoc.svelte.js';

const story_1_id = svid();
const page_1_id = svid();
const list_1_id = svid();
const list_item_1_id = svid();
const list_item_2_id = svid();

function __create_test_doc() {
  const doc_schema = {
    page: {
      body: {
        type: 'multiref',
        ref_types: ['paragraph', 'story', 'list'],
        default_ref_type: 'paragraph',
      },
      keywords: {
        type: 'string_array',
      },
      daily_visitors: {
        type: 'integer_array',
      },
      created_at: {
        type: 'datetime'
      }
    },
    paragraph: {
      content: { type: 'annotated_text' },
    },
    story: {
      layout: { type: 'integer' },
      title: { type: 'annotated_text' },
      description: { type: 'annotated_text' },
      image: { type: 'string' }, // a dedicated type asset would be better
      
    },
    list_item: {
      content: { type: 'annotated_text' },
    },
    list: {
      list_items: {
        type: 'multiref',
        ref_types: ['list_item'],
        default_ref_type: 'list_item',
      },
    },
  };

  const raw_doc = [
    {
      id: story_1_id,
      type: 'story',
      layout: 1,
      image: '/images/editable.svg',
      title: ['First story', []],
      description: ['First story description.', []]
    },
    {
      id: list_item_1_id,
      type: 'list_item',
      content: ['first list item', []],
    },
    {
      id: list_item_2_id,
      type: 'list_item',
      content: ['second list item', []],
    },
    {
      id: list_1_id,
      type: 'list',
      list_items: [list_item_1_id, list_item_2_id],
    },
    {
      id: page_1_id,
      type: 'page',
      body: [story_1_id, story_1_id, list_1_id],
      keywords: ['svelte', 'editor', 'rich content'],
      daily_visitors: [10, 20, 30, 100],
      created_at: '2025-05-30T10:39:59.987Z'
    },
  ];

  return new SveditDoc(doc_schema, raw_doc);
}

describe('SveditDoc.svelte.js', () => {
  it('should be traversable', () => {
    const doc = __create_test_doc();

    // Resolve node by id
    const page_1 = doc.get(page_1_id);
    expect(page_1.id).toBe(page_1_id);
    expect(page_1.type).toBe('page');
    
    // Resolve multiref property
    const body = doc.get([page_1_id, 'body']);
    expect(body).toEqual([story_1_id, story_1_id, list_1_id]);
    
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