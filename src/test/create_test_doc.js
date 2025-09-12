import Document, { define_document_schema } from '../lib/Document.svelte.js';
import nanoid from '../routes/nanoid.js';

// System components
import Overlays from '../routes/components/Overlays.svelte';
import NodeCursorTrap from '../routes/components/NodeCursorTrap.svelte';

// Node components
import Page from '../routes/components/Page.svelte';
import Story from '../routes/components/Story.svelte';
import Button from '../routes/components/Button.svelte';
import Text from '../routes/components/Text.svelte';
import List from '../routes/components/List.svelte';
import ListItem from '../routes/components/ListItem.svelte';

export const button_1_id = 'button_1';
export const story_1_id = 'story_1';
export const page_1_id = 'page_1';
export const list_1_id = 'list_1';
export const list_item_1_id = 'list_item_1';
export const list_item_2_id = 'list_item_2';

const document_schema = define_document_schema({
  page: {
    kind: 'document',
    properties: {
      body: {
        type: 'node_array',
        node_types: ['text', 'story', 'list'],
        default_node_type: 'text',
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
    }
  },
  button: {
    kind: 'block',
    properties: {
      label: { type: 'annotated_string', allow_newlines: false },
      href: { type: 'string' },
    }
  },
  text: {
    kind: 'text',
    properties: {
      layout: { type: 'integer' },
      content: { type: 'annotated_string', allow_newlines: true },
    }
  },
  story: {
    kind: 'block',
    properties: {
      layout: { type: 'integer' },
      title: { type: 'annotated_string', allow_newlines: false },
      description: { type: 'annotated_string', allow_newlines: true },
      buttons: { type: 'node_array', node_types: ['button'], default_node_type: 'button' },
      image: { type: 'string' }, // a dedicated type asset would be better
    }
  },
  list_item: {
    kind: 'text',
    properties: {
      content: { type: 'annotated_string', allow_newlines: true },
    }
  },
  list: {
    kind: 'block',
    properties: {
      layout: { type: 'integer' },
      list_items: {
        type: 'node_array',
        node_types: ['list_item'],
        default_node_type: 'list_item',
      },
    }
  },
});

const serialized_doc = [
  {
    id: button_1_id,
    type: 'button',
    label: ['Get started', []],
    href: 'https://github.com/michael/svedit'
  },
  {
    id: story_1_id,
    type: 'story',
    layout: 1,
    image: 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?q=80&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    title: ['First story', []],
    buttons: [button_1_id],
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
    layout: 1,
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

// App-specific config object, always available via doc.config for introspection
const document_config = {
  generate_id: nanoid,
  system_components: {
    NodeCursorTrap,
    Overlays,
  },
  // Registry of components for each node type
  node_components: {
    Page,
    Button,
    Text,
    Story,
    List,
    ListItem,
  },
  node_layouts: {
    text: 4,
    story: 3,
    list: 5,
    list_item: 1,
  },
  // Custom functions to insert new "blank" nodes and setting the selection depening on the
  // intended behavior.
  inserters: {
    button: function(tr) {
      const new_button = {
        id: nanoid(),
        type: 'button',
        label: ['', []],
        href: 'https://editable.website'
      };
  		tr.insert_nodes([new_button]);
      tr.set_selection({
        type: 'node',
        path: [...tr.doc.selection.path ],
        anchor_offset: tr.doc.selection.focus_offset,
        focus_offset: tr.doc.selection.focus_offset
      });
    },
    text: function(tr, content = ['', []], layout = 1) {
      const new_text = {
   			id: nanoid(),
   			type: 'text',
        layout,
   			content
  		};
  		tr.insert_nodes([new_text]);
      // NOTE: Relies on insert_nodes selecting the newly inserted node(s)
      tr.set_selection({
        type: 'text',
        path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1 , 'content'],
        anchor_offset: 0,
        focus_offset: 0
      });
    },
    story: function(tr) {
      const new_button = {
        id: nanoid(),
        type: 'button',
        label: ['', []],
        href: 'https://editable.website'
      };
      tr.create(new_button);
      const new_story = {
        id: nanoid(),
        type: 'story',
        layout: 1,
        image: '',
        title: ['', []],
        description: ['', []],
        buttons: [new_button.id]
      };
  		tr.insert_nodes([new_story]);
      // NOTE: Relies on insert_nodes selecting the newly inserted node(s)
      // tr.set_selection({
      //   type: 'text',
      //   path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1, 'title'],
      //   anchor_offset: 0,
      //   focus_offset: 0
      // });
    },
    list: function(tr) {
      const new_list_item = {
        id: nanoid(),
        type: 'list_item',
        content: ['', []]
      };
      tr.create(new_list_item);
      const new_list = {
        id: nanoid(),
        type: 'list',
        list_items: [new_list_item.id],
        layout: 3,
      };
  		tr.insert_nodes([new_list]);
      // tr.set_selection({
      //   type: 'text',
      //   path: [...tr.selection.path, tr.selection.focus_offset - 1, 'list_items', 0, 'content'],
      //   anchor_offset: 0,
      //   focus_offset: 0
      // });
    },
    list_item: function(tr, content = ['', []]) {
      const new_list_item = {
        id: nanoid(),
        type: 'list_item',
        content
      };
  		tr.insert_nodes([new_list_item]);
      tr.set_selection({
        type: 'text',
        path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1 , 'content'],
        anchor_offset: 0,
        focus_offset: 0
      });
    },
  }
};

export default function create_test_doc() {
  const doc = new Document(document_schema, serialized_doc, { config: document_config });
  return doc;
}
