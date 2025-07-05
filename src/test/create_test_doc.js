import Document from '../lib/Document.svelte.js';
import { svid } from '../lib/util.js';

export const story_1_id = svid();
export const page_1_id = svid();
export const list_1_id = svid();
export const list_item_1_id = svid();
export const list_item_2_id = svid();

export function create_test_doc() {
  const document_schema = {
    page: {
      body: {
        type: 'node_array',
        node_types: ['paragraph', 'story', 'list'],
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
      content: { type: 'annotated_string' },
    },
    story: {
      layout: { type: 'integer' },
      title: { type: 'annotated_string' },
      description: { type: 'annotated_string' },
      image: { type: 'string' }, // a dedicated type asset would be better

    },
    list_item: {
      content: { type: 'annotated_string' },
    },
    list: {
      list_items: {
        type: 'node_array',
        node_types: ['list_item'],
        default_ref_type: 'list_item',
      },
    },
  };

  const raw_doc = [
    {
      id: story_1_id,
      type: 'story',
      layout: 1,
      image: 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?q=80&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
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

  return new Document(document_schema, raw_doc);
}
