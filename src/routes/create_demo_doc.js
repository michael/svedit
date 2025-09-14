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
import Highlight from './components/Highlight.svelte';
import Link from './components/Link.svelte';

const ALL_ANNOTATIONS = ['strong', 'emphasis', 'highlight', 'link'];
const TITLE_ANNOTATIONS = ['emphasis', 'highlight'];

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
      layout: { type: 'integer' },
      title: {
        type: 'annotated_text',
        node_types: TITLE_ANNOTATIONS,
        allow_newlines: false,
      },
      description: {
        type: 'annotated_text',
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
        type: 'annotated_text',
        node_types: ALL_ANNOTATIONS,
        allow_newlines: true,
      },
    }
  },
  button: {
    kind: 'block',
    properties: {
      label: {
        type: 'annotated_text',
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
        type: 'annotated_text',
        node_types: TITLE_ANNOTATIONS,
        allow_newlines: false,
      },
      description: {
        type: 'annotated_text',
        node_types: ALL_ANNOTATIONS,
        allow_newlines: true,
      },
      buttons: {
        type: 'node_array',
        node_types: ['button'],
        default_node_type: 'button',
      },
      image: { type: 'string' },
    }
  },
  image_grid: {
    kind: 'block',
    properties: {
      layout: { type: 'integer' },
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
        type: 'annotated_text',
        node_types: TITLE_ANNOTATIONS,
        allow_newlines: false,
      },
      description: {
        type: 'annotated_text',
        node_types: ALL_ANNOTATIONS,
        allow_newlines: false
      }
    }
  },
  list_item: {
    kind: 'text',
    properties: {
      content: {
        type: 'annotated_text',
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
  highlight: {
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
    layout: 1,
    title: {text: 'Svedit', annotations: []},
    description: {text: 'A tiny library for building rich content editors with Svelte 5.', annotations: []},
    image: '',
  },
  {
    id: heading_1_id,
    type: 'text',
    layout: 2,
    content: {text: 'Text and structured content in symbiosis', annotations: []}
  },
  {
    id: paragraph_1_id,
    type: 'text',
    layout: 1,
    content: {text: 'Unlike most rich text editors, Svedit isn\'t restricted to a linear character-based model for addressing content and cursor positions. For that reason we can combine text-ish content like a paragraph or heading with structured, form-like content.', annotations: []}
  },
  {
    id: button_1_id,
    type: 'button',
    label: {text: 'Get started', annotations: []},
    href: 'https://github.com/michael/svedit'
  },
  {
    id: story_1_id,
    type: 'story',
    layout: 1,
    image: '/images/editable.svg',
    title: {text: 'Visual in‑place editing', annotations: []},
    description: {text: 'Model your content in JSON, render it with Svelte components, and edit content directly in the layout. You only have to follow a couple of rules to make this work.', annotations: []},
    buttons: []
  },
  {
    id: story_2_id,
    type: 'story',
    layout: 2,
    image: '/images/lightweight.svg',
    title: {text: 'Minimal viable editor', annotations: []},
    description: {text: "The reference implementation uses only about 2000 lines of code. That means you'll be able to serve editable web pages, removing the need for a separate Content Management System.", annotations: [{start_offset: 100, end_offset: 118, node_id: link_1_id}]},
    buttons: []
  },
  {
    id: story_3_id,
    type: 'story',
    layout: 1,
    image: '/images/nested-blocks-illustration.svg',
    title: {text: 'Nested nodes', annotations: []},
    description: {text: 'A node can embed a node_array of other nodes. For instance the list node at the bottom of the page has a node_array of list items.', annotations: []},
    buttons: []
  },

  {
    id: image_grid_item_1_id,
    type: 'image_grid_item',
    image: '/images/svelte-framework.svg',
    title: { text: "Svelte-native editing", annotations: [] },
    description: { text: "No mingling with 3rd-party rendering API's.", annotations: [] },
  },
  {
    id: image_grid_item_2_id,
    type: 'image_grid_item',
    image: '/images/annotations.svg',
    title: { text: "Annotations are nodes, not marks", annotations: [] },
    description: { text: "Addressable by path, schema‑defined, copy&paste-safe.", annotations: [] },
  },
  {
    id: image_grid_item_3_id,
    type: 'image_grid_item',
    image: '/images/graphmodel.svg',
    title: { text: "Graph‑first content with nested nodes", annotations: [] },
    description: { text: "From simple paragraphs to complex nodes with nested arrays and multiple properties.", annotations: [] },
  },
  {
    id: image_grid_item_4_id,
    type: 'image_grid_item',
    image: '/images/dom-synced.svg',
    title: { text: "DOM ↔ model selections match", annotations: [] },
    description: { text: "Avoids flaky mapping layers found in other editors.", annotations: [] },
  },
  {
    id: image_grid_item_5_id,
    type: 'image_grid_item',
    image: '/images/cjk.svg',
    title: { text: "Unicode‑safe, composition‑safe input", annotations: [] },
    description: { text: "Works correctly with emoji, diacritics, and CJK.", annotations: [] },
  },
  {
    id: image_grid_item_6_id,
    type: 'image_grid_item',
    image: '/images/timetravel.svg',
    title: { text: "Transactional editing with time travel", annotations: [] },
    description: { text: "Every change is safe and undoable.", annotations: [] },
  },
  {
    id: image_grid_1_id,
    type: 'image_grid',
    layout: 1,
    image_grid_items: [image_grid_item_1_id, image_grid_item_2_id, image_grid_item_3_id, image_grid_item_4_id, image_grid_item_5_id, image_grid_item_6_id],
  },
  {
    id: story_4_id,
    type: 'story',
    layout: 2,
    image: '/images/node-cursors.svg',
    title: {text: 'Node cursors', annotations: []},
    description: {text: 'They work just like text cursors, but instead of a character position in a string they address a node position in a node_array.\n\nTry it by selecting one of the gaps between the nodes. Then press ↵ to insert a new node or ⌫ to delete the node before the cursor.', annotations: []},
    buttons: []
  },
  {
    id: story_5_id,
    type: 'story',
    layout: 1,
    image: '/images/svelte-logo.svg',
    title: {text: 'Made for Svelte 5', annotations: []},
    description: {text: 'Integrate with your Svelte application. Use it as a template and copy and paste Svedit.svelte to build your custom rich content editor.', annotations: [{start_offset: 20, end_offset: 26, node_id: link_2_id}, {start_offset: 80, end_offset: 93, node_id: emphasis_1_id}]},
    buttons: []
  },
  {
    id: story_6_id,
    type: 'story',
    layout: 2,
    image: '/images/extendable.svg',
    title: {text: 'Alpha version', annotations: []},
    description: {text: 'Expect bugs. Expect missing features. Expect the need for more work on your part to make this work for your use case.\n\nFind below a list of known issues we\'ll be working to get fixed next:', annotations: []},
    buttons: [button_1_id]
  },
  {
    id: list_item_1_id,
    type: 'list_item',
    content: {text: 'It\'s a bit hard to select whole lists or image grids with the mouse still. We\'re looking to improve this. However by pressing the ESC key (or CMD+A) several times you can reach parent nodes easily.', annotations: []}
  },
  {
    id: list_item_2_id,
    type: 'list_item',
    content: {text: 'Copy and pasting from and to external sources is not yet supported, but soon will be.', annotations: []}
  },
  {
    id: list_item_3_id,
    type: 'list_item',
    content: {text: 'Works best in Chrome, as Svedit uses CSS Anchor Positioning for overlays.', annotations: []}
  },
  {
    id: list_item_4_id,
    type: 'list_item',
    content: {text: 'Mobile support ist still experimental. As of 0.3.0 Svedit works on latest iOS and Android, but the UX isn\'t optimized yet.', annotations: []}
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
    title: {text: 'Star us on GitHub', annotations: []},
    description: {text: 'Please star Svedit on GitHub or watch the repo to be notified about updates. Svedit is made by Michael Aufreiter and Johannes Mutter and is licensed under the MIT License.', annotations: [
        {start_offset: 0, end_offset: 28, node_id: link_3_id},
        {start_offset: 95, end_offset: 112, node_id: link_4_id},
        {start_offset: 117, end_offset: 132, node_id: link_5_id}
      ]
    },
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
    Highlight,
    Link
  },
  // HTML exporters for different node types
  html_exporters: {
    list: (node, doc) => {
      let html = '<ul>\n';
      for (const list_item_id of node.list_items) {
        const list_item = doc.get(list_item_id);
        html += `<li>${list_item.content.text}</li>\n`
      }
      return html += '</ul>';
    },
    story: (node) => {
      let html = `<h1>${node.title.text}</h1>\n`;

      if (node.description) {
        html += `<p>${node.description.text}</p>\n`;
      }

      if (node.image) {
        html += `<img src="${node.image}" alt="${node.title.text}" style="max-width: 400px; height: auto; display: block;" />\n`;
      }

      return html;
    },
    text: (node) => {
      return `<p style="white-space:pre-wrap;">${node.content.text}</p>\n`;
    },
    button: (node) => {
      return `<a href="${node.href}" style="display: inline-block; padding: 8px 16px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">${node.label.text}</a>\n`;
    },
    hero: (node) => {
      let html = '';

      if (node.title.text.trim()) {
        html += `<h1>${node.title.text}</h1>\n`;
      }

      if (node.description.text.trim()) {
        html += `<p>${node.description.text}</p>\n`;
      }

      if (node.image) {
        html += `<img src="${node.image}" alt="${node.title.text}" style="max-width: 400px; height: auto;" />\n`;
      }

      return html;
    },
    image_grid: (node, doc) => {
      let html = '<div class="image-grid">\n';
      for (const image_grid_item_id of node.image_grid_items) {
        const image_grid_item = doc.get(image_grid_item_id);
        html += '<div class="image-grid-item">\n';
        if (image_grid_item.image) {
          html += `<img src="${image_grid_item.image}" alt="${image_grid_item.title.text}" style="max-width: 200px; height: auto;" />\n`;
        }
        if (image_grid_item.title.text.trim()) {
          html += `<p>${image_grid_item.title.text}</p>\n`;
        }
        if (image_grid_item.description.text.trim()) {
          html += `<p>${image_grid_item.description.text}</p>\n`;
        }
        html += '</div>\n';
      }
      return html += '</div>';
    },
    image_grid_item: (node) => {
      let html = '<div class="image-grid-item">\n';
      if (node.image) {
        html += `<img src="${node.image}" alt="${node.title.text}" style="max-width: 200px; height: auto;" />\n`;
      }
      if (node.title.text.trim()) {
        html += `<p>${node.title.text}</p>\n`;
      }
      if (node.description.text.trim()) {
        html += `<p>${node.description.text}</p>\n`;
      }
      return html += '</div>';
    },
    list_item: (node) => {
      const content = (typeof node.content === 'object' && node.content.text) ? node.content.text : (node.content || '');
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
    hero: 1
  },
  // Custom functions to insert new "blank" nodes and setting the selection depening on the
  // intended behavior.
  inserters: {
    text: function(tr, content = {text: '', annotations: []}, layout = 1) {
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
        label: {text: '', annotations: []},
        href: 'https://editable.website'
      };
      tr.create(new_button);
      const new_story = {
        id: nanoid(),
        type: 'story',
        layout: 1,
        image: '',
        title: {text: '', annotations: []},
        description: {text: '', annotations: []},
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
        content: {text: '', annotations: []}
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
    list_item: function(tr, content = {text: '', annotations: []}) {
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
          title: {text: '', annotations: []},
          description: {text: '', annotations: []},
          image: ''
        };
        tr.create(image_grid_item);
        new_image_grid_items.push(image_grid_item.id);
      }
      const new_image_grid = {
        id: nanoid(),
        type: 'image_grid',
        layout: 1,
        image_grid_items: new_image_grid_items,
      };
  		tr.insert_nodes([new_image_grid]);
    },
    image_grid_item: function(tr) {
      const new_image_grid_item = {
        id: nanoid(),
        type: 'image_grid_item',
        title: {text: '', annotations: []},
        description: {text: '', annotations: []},
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
        label: {text: '', annotations: []},
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
        layout: 1,
        title: {text: '', annotations: []},
        description: {text: '', annotations: []},
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
