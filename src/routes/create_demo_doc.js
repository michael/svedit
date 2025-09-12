import { Document, define_document_schema } from 'svedit';
import nanoid from './nanoid.js';

// System components
import NodeCursorTrap from './components/NodeCursorTrap.svelte';
import Overlays from './components/Overlays.svelte';

// Node components
import Page from './components/Page.svelte';
import Story from './components/Story.svelte';
import Button from './components/Button.svelte';
import Text from './components/Text.svelte';
import List from './components/List.svelte';
import ListItem from './components/ListItem.svelte';
import ImageGrid from './components/ImageGrid.svelte';
import ImageGridItem from './components/ImageGridItem.svelte';
import Hero from './components/Hero.svelte';
import Strong from './components/Strong.svelte';
import Emphasis from './components/Emphasis.svelte';
import Link from './components/Link.svelte';

const ALL_ANNOTATIONS = ['strong', 'emphasis', 'link'];
const TITLE_ANNOTATIONS = ['emphasis'];

const document_schema = define_document_schema({
  page: {
    kind: 'document',
    properties: {
      body: {
        type: 'node_array',
        node_types: ['text', 'story', 'list', 'image_grid', 'hero'],
        default_node_type: 'text',
      },
      hero: {
        type: 'node',
        node_types: ['hero'],
        default_node_type: 'hero',
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
  hero: {
    kind: 'block',
    properties: {
      title: {
        type: 'annotated_string',
        node_types: TITLE_ANNOTATIONS,
        allow_newlines: false,
      },
      description: {
        type: 'annotated_string',
        node_types: ALL_ANNOTATIONS,
        allow_newlines: true,
      },
      image: { type: 'string' }, // a dedicated type asset would be better
    }
  },
  text: {
    kind: 'text',
    properties: {
      layout: { type: 'integer' },
      content: {
        type: 'annotated_string',
        node_types: ALL_ANNOTATIONS,
        allow_newlines: true,
      },
    }
  },
  button: {
    kind: 'block',
    properties: {
      label: {
        type: 'annotated_string',
        node_types: [],
        allow_newlines: false,
      },
      href: { type: 'string' },
    }
  },
  story: {
    kind: 'block',
    properties: {
      layout: { type: 'integer' },
      title: {
        type: 'annotated_string',
        node_types: TITLE_ANNOTATIONS,
        allow_newlines: false,
      },
      description: {
        type: 'annotated_string',
        node_types: ALL_ANNOTATIONS,
        allow_newlines: true,
      },
      buttons: { type: 'node_array', node_types: ['button'], default_node_type: 'button' },
      image: { type: 'string' }, // a dedicated type asset would be better
    }
  },
  image_grid: {
    kind: 'block',
    properties: {
      image_grid_items: {
        type: 'node_array',
        node_types: ['image_grid_item'],
      }
    }
  },
  image_grid_item: {
    kind: 'block',
    properties: {
      image: { type: 'string' }, // a dedicated type asset would be better
      title: {
        type: 'annotated_string',
        node_types: TITLE_ANNOTATIONS,
        allow_newlines: false,
      },
    }
  },
  list_item: {
    kind: 'text',
    properties: {
      content: {
        type: 'annotated_string',
        node_types: ALL_ANNOTATIONS,
        allow_newlines: false,
      },
    }
  },
  list: {
    kind: 'block',
    properties: {
      list_items: {
        type: 'node_array',
        node_types: ['list_item'],
      },
      layout: { type: 'integer' },
    }
  },
  link: {
    kind: 'annotation',
    properties: {
      href: { type: 'string' }
    }
  },
  strong: {
    kind: 'annotation',
    properties: {}
  },
  emphasis: {
    kind: 'annotation',
    properties: {}
  },
});


// Generate IDs for all content nodes
const page_1_id = 'page_1';
const hero_1_id = 'hero_1';
const heading_1_id = 'heading_1';
const paragraph_1_id = 'paragraph_1';
const story_1_id = 'story_1';
const story_2_id = 'story_2';
const story_3_id = 'story_3';
const story_4_id = 'story_4';
const story_5_id = 'story_5';
const story_6_id = 'story_6';
const story_7_id = 'story_7';
const list_1_id = 'list_1';
const list_item_1_id = 'list_item_1';
const list_item_2_id = 'list_item_2';
const list_item_3_id = 'list_item_3';
const list_item_4_id = 'list_item_4';
const emphasis_1_id = 'emphasis_1';
const link_1_id = 'link_1';
const link_2_id = 'link_2';
const link_3_id = 'link_3';
const link_4_id = 'link_4';
const link_5_id = 'link_5';
const button_1_id = 'button_1';

const image_grid_1_id = 'image_grid_1';
const image_grid_item_1_id = 'image_grid_item_1';
const image_grid_item_2_id = 'image_grid_item_2';
const image_grid_item_3_id = 'image_grid_item_3';
const image_grid_item_4_id = 'image_grid_item_4';
const image_grid_item_5_id = 'image_grid_item_5';
const image_grid_item_6_id = 'image_grid_item_6';

const serialized_doc = [
  {
    id: emphasis_1_id,
    type: 'emphasis',
  },
  {
    id: link_1_id,
    type: 'link',
    href: 'https://editable.website'
  },
  {
    id: link_2_id,
    type: 'link',
    href: 'https://svelte.dev'
  },
  {
    id: link_3_id,
    type: 'link',
    href: 'https://github.com/michael/svedit/'
  },
  {
    id: link_4_id,
    type: 'link',
    href: 'https://michaelaufreiter.com'
  },
  {
    id: link_5_id,
    type: 'link',
    href: 'https://mutter.co'
  },
  {
    id: hero_1_id,
    type: 'hero',
    title: ['Svedit', []],
    description: ['A tiny library for building rich content editors with Svelte 5.', []],
    image: '',
  },
  {
    id: heading_1_id,
    type: 'text',
    layout: 2,
    content: ['Text and structured content in symbiosis', []]
  },
  {
    id: paragraph_1_id,
    type: 'text',
    layout: 1,
    content: ['Unlike most rich text editors, Svedit isn’t restricted to a linear character-based model for addressing content and cursor positions. For that reason we can combine text-ish content like a paragraph or heading with structured, form-like content.', []]
  },
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
    image: '/images/editable.svg',
    title: ['Visual in‑place editing', []],
    description: ['Model your content in JSON, render it with Svelte components, and edit content directly in the layout. You only have to follow a couple of rules to make this work.', []],
    buttons: []
  },
  {
    id: story_2_id,
    type: 'story',
    layout: 2,
    image: '/images/lightweight.svg',
    title: ['Minimal viable editor', []],
    description: ["The reference implementation uses only about 2000 lines of code. That means you'll be able to serve editable web pages, removing the need for a separate Content Management System.", [[100,118, link_1_id]]],
    buttons: []
  },
  {
    id: story_3_id,
    type: 'story',
    layout: 1,
    image: '/images/nested-blocks-illustration.svg',
    title: ['Nested nodes', []],
    description: ['A node can embed a node_array of other nodes. For instance the list node at the bottom of the page has a node_array of list items.', []],
    buttons: []
  },

  {
    id: image_grid_item_1_id,
    type: 'image_grid_item',
    image: '/images/extendable.svg',
    title: ['First thing', []],
  },
  {
    id: image_grid_item_2_id,
    type: 'image_grid_item',
    image: '/images/extendable.svg',
    title: ['Second thing', []],
  },
  {
    id: image_grid_item_3_id,
    type: 'image_grid_item',
    image: '/images/extendable.svg',
    title: ['Third thing', []],
  },
  {
    id: image_grid_item_4_id,
    type: 'image_grid_item',
    image: '/images/extendable.svg',
    title: ['Fourth thing', []],
  },
  {
    id: image_grid_item_5_id,
    type: 'image_grid_item',
    image: '/images/extendable.svg',
    title: ['Fifth thing', []],
  },
  {
    id: image_grid_item_6_id,
    type: 'image_grid_item',
    image: '/images/extendable.svg',
    title: ['Sixth thing', []],
  },
  {
    id: image_grid_1_id,
    type: 'image_grid',
    image_grid_items: [image_grid_item_1_id, image_grid_item_2_id, image_grid_item_3_id, image_grid_item_4_id, image_grid_item_5_id, image_grid_item_6_id],
  },
  {
    id: story_4_id,
    type: 'story',
    layout: 2,
    image: '/images/node-cursors.svg',
    title: ['Node cursors', []],
    description: ['They work just like text cursors, but instead of a character position in a string they address a node position in a node_array.\n\nTry it by selecting one of the gaps between the nodes. Then press ↵ to insert a new node or ⌫ to delete the node before the cursor.', []],
    buttons: []
  },
  {
    id: story_5_id,
    type: 'story',
    layout: 1,
    image: '/images/svelte-logo.svg',
    title: ['Made for Svelte 5', []],
    description: ['Integrate with your Svelte application. Use it as a template and copy and paste Svedit.svelte to build your custom rich content editor.', [ [20, 26, link_2_id], [80, 93, emphasis_1_id] ]],
    buttons: []
  },
  {
    id: story_6_id,
    type: 'story',
    layout: 2,
    image: '/images/extendable.svg',
    title: ['Alpha version', []],
    description: ['Expect bugs. Expect missing features. Expect the need for more work on your part to make this work for your use case.\n\nFind below a list of known issues we\'ll be working to get fixed next:', []],
    buttons: [button_1_id]
  },
  {
    id: list_item_1_id,
    type: 'list_item',
    content: ['It’s a bit hard to select whole lists or image grids with the mouse still. We\'re looking to improve this. However by pressing the ESC key (or CMD+A) several times you can reach parent nodes easily.', []]
  },
  {
    id: list_item_2_id,
    type: 'list_item',
    content: ['Copy and pasting from and to external sources is not yet supported, but soon will be.', []]
  },
  {
    id: list_item_3_id,
    type: 'list_item',
    content: ['Works best in Chrome, as Svedit uses CSS Anchor Positioning for overlays.', []]
  },
  {
    id: list_item_4_id,
    type: 'list_item',
    content: ['Mobile support ist still experimental. As of 0.3.0 Svedit works on latest iOS and Android, but the UX isn\'t optimized yet.', []]
  },
  {
    id: list_1_id,
    type: 'list',
    list_items: [list_item_1_id, list_item_2_id, list_item_3_id, list_item_4_id],
    layout: 3,
  },
  {
    id: story_7_id,
    type: 'story',
    layout: 1,
    image: '/images/github.svg',
    title: ['Star us on GitHub', []],
    description: ['Please star Svedit on GitHub or watch the repo to be notified about updates. Svedit is made by Michael Aufreiter and Johannes Mutter and is licensed under the MIT License.',
      [
        [0, 28, link_3_id],
        [95, 112, link_4_id],
        [117,132, link_5_id],
      ]
    ],
    buttons: []
  },
  // IMPORTANT: The root node (entry point) must be the last one in the array
  {
    id: page_1_id,
    type: 'page',
    body: [hero_1_id, heading_1_id, paragraph_1_id, story_1_id, story_2_id, image_grid_1_id, story_3_id, story_4_id, story_5_id, story_6_id, list_1_id, story_7_id],
    hero: hero_1_id,
    keywords: ['svelte', 'editor', 'rich content'],
    daily_visitors: [10, 20, 30, 100],
    created_at: '2025-05-30T10:39:59.987Z'
  },
];

// App-specific config object, always available via doc.config for introspection
const document_config = {
  // Custom ID generator function
  generate_id: nanoid,
  // Provide definitions/overrides for system native components,
  // such as NodeCursorTrap or Overlays
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
    ImageGrid,
    ImageGridItem,
    Hero,
    Strong,
    Emphasis,
    Link
  },
  // HTML exporters for different node types
  html_exporters: {
    list: (node, doc) => {
      let html = '<ul>\n';
      for (const list_item_id of node.list_items) {
        const list_item = doc.get(list_item_id);
        html += `<li>${list_item.content[0]}</li>\n`
      }
      return html += '</ul>';
    },
    story: (node) => {
      const title_text = Array.isArray(node.title) ? node.title[0] : (node.title || 'Untitled Story');
      let html = `<h1>${title_text}</h1>\n`;

      if (node.description) {
        const description_text = Array.isArray(node.description) ? node.description[0] : node.description;
        html += `<p>${description_text}</p>\n`;
      }

      if (node.image) {
        html += `<img src="${node.image}" alt="${title_text}" style="max-width: 400px; height: auto; display: block;" />\n`;
      }

      return html;
    },
    text: (node) => {
      const content = Array.isArray(node.content) ? node.content[0] : (node.content || '');
      if (content.trim()) {
        return `<p style="white-space:pre-wrap;">${content}</p>\n`;
      }
      return '';
    },
    button: (node) => {
      const label_text = Array.isArray(node.label) ? node.label[0] : (node.label || 'Button');
      if (node.href) {
        return `<a href="${node.href}" style="display: inline-block; padding: 8px 16px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">${label_text}</a>\n`;
      } else {
        return `<button style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px;">${label_text}</button>\n`;
      }
    },
    hero: (node) => {
      const title_text = Array.isArray(node.title) ? node.title[0] : (node.title || '');
      const description_text = Array.isArray(node.description) ? node.description[0] : (node.description || '');
      let html = '';

      if (title_text.trim()) {
        html += `<h1>${title_text}</h1>\n`;
      }

      if (description_text.trim()) {
        html += `<p>${description_text}</p>\n`;
      }

      if (node.image) {
        html += `<img src="${node.image}" alt="${title_text}" style="max-width: 400px; height: auto;" />\n`;
      }

      return html;
    },
    image_grid: (node, doc) => {
      let html = '<div class="image-grid">\n';
      for (const image_grid_item_id of node.image_grid_items) {
        const image_grid_item = doc.get(image_grid_item_id);
        const title_text = Array.isArray(image_grid_item.title) ? image_grid_item.title[0] : (image_grid_item.title || '');
        html += '<div class="image-grid-item">\n';
        if (image_grid_item.image) {
          html += `<img src="${image_grid_item.image}" alt="${title_text}" style="max-width: 200px; height: auto;" />\n`;
        }
        if (title_text.trim()) {
          html += `<p>${title_text}</p>\n`;
        }
        html += '</div>\n';
      }
      return html += '</div>';
    },
    image_grid_item: (node) => {
      const title_text = Array.isArray(node.title) ? node.title[0] : (node.title || '');
      let html = '<div class="image-grid-item">\n';
      if (node.image) {
        html += `<img src="${node.image}" alt="${title_text}" style="max-width: 200px; height: auto;" />\n`;
      }
      if (title_text.trim()) {
        html += `<p>${title_text}</p>\n`;
      }
      return html += '</div>';
    },
    list_item: (node) => {
      const content = Array.isArray(node.content) ? node.content[0] : (node.content || '');
      return `<li>${content}</li>\n`;
    },

  },
  node_layouts: {
    button: 1,
    text: 4,
    story: 3,
    list: 5,
    list_item: 1,
    image_grid: 1,
    image_grid_item: 1,
    hero: 1
  },
  // Custom functions to insert new "blank" nodes and setting the selection depening on the
  // intended behavior.
  inserters: {
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

    image_grid: function(tr) {
      const new_image_grid_items = [];
      for (let i = 0; i < 6; i++) {
        const image_grid_item = {
          id: nanoid(),
          type: 'image_grid_item',
          title: ['', []],
          image: ''
        };
        tr.create(image_grid_item);
        new_image_grid_items.push(image_grid_item.id);
      }
      const new_image_grid = {
        id: nanoid(),
        type: 'image_grid',
        image_grid_items: new_image_grid_items,
      };
  		tr.insert_nodes([new_image_grid]);
    },
    image_grid_item: function(tr) {
      const new_image_grid_item = {
        id: nanoid(),
        type: 'image_grid_item',
        title: ['', []],
        image: ''
      };
  		tr.insert_nodes([new_image_grid_item]);
      tr.set_selection({
        type: 'node',
        path: [...tr.doc.selection.path ],
        anchor_offset: tr.doc.selection.focus_offset,
        focus_offset: tr.doc.selection.focus_offset
      });
    },
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
    hero: function(tr) {
      const new_hero = {
        id: nanoid(),
        type: 'hero',
        title: ['', []],
        description: ['', []],
        image: '',
      };
      tr.insert_nodes([new_hero]);
      // tr.set_selection({
      //   type: 'text',
      //   path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1, 'title'],
      //   anchor_offset: 0,
      //   focus_offset: 0
      // });
    }
  }
};

export default function create_demo_doc() {
  const doc = new Document(document_schema, serialized_doc, { config: document_config });
  return doc;
}
