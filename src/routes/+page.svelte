<script>
  import Svedit from '$lib/Svedit.svelte';
  import Document from '$lib/Document.svelte.js';
  import NodeArrayProperty from '$lib/NodeArrayProperty.svelte';
  import { svid } from '$lib/util.js';

  import Story from './components/Story.svelte';
  import Paragraph from './components/Paragraph.svelte';
  import Heading from './components/Heading.svelte';
  import List from './components/List.svelte';
  import ImageGrid from './components/ImageGrid.svelte';
  import Hero from './components/Hero.svelte';
  import UnknownNode from './components/UnknownNode.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import Overlays from './components/Overlays.svelte';
	import Icon from './components/Icon.svelte';

  const document_schema = {
    page: {
      body: {
        type: 'node_array',
        node_types: ['paragraph', 'heading', 'story', 'list', 'image_grid', 'hero'],
        default_ref_type: 'paragraph',
      },
      hero: {
        type: 'node',
        node_types: ['hero'],
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
    hero: {
      title: { type: 'annotated_string' },
      description: { type: 'annotated_string' },
      image: { type: 'string' }, // a dedicated type asset would be better
    },
    heading: {
      content: { type: 'annotated_string' },
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
    image_grid: {
      image_grid_items: {
        type: 'node_array',
        node_types: ['image_grid_item'],
      }
    },
    image_grid_item: {
      image: { type: 'string' }, // a dedicated type asset would be better
      title: { type: 'annotated_string' },
    },
    list_item: {
      content: { type: 'annotated_string' },
    },
    list: {
      list_items: {
        type: 'node_array',
        node_types: ['list_item'],
      },
      list_style: { type: 'string' },
    },
  };

  // Generate IDs for all content nodes
  const page_1_id = svid();
  const hero_1_id = svid();
  const heading_1_id = svid();
  const paragraph_1_id = svid();
  const paragraph_2_id = svid();
  const story_1_id = svid();
  const story_2_id = svid();
  const story_3_id = svid();
  const story_4_id = svid();
  const story_5_id = svid();
  const story_6_id = svid();
  const story_7_id = svid();
  const list_1_id = svid();
  const list_item_1_id = svid();
  const list_item_2_id = svid();
  const list_item_3_id = svid();
  const list_item_4_id = svid();

  const image_grid_1_id = svid();
  const image_grid_item_1_id = svid();
  const image_grid_item_2_id = svid();
  const image_grid_item_3_id = svid();
  const image_grid_item_4_id = svid();
  const image_grid_item_5_id = svid();
  const image_grid_item_6_id = svid();

  const raw_doc = [
    {
      id: hero_1_id,
      type: 'hero',
      title: ['Svedit', []],
      description: ['A tiny library for building rich content editors with Svelte 5.', []],
      image: '/images/svedit-hero.webp',
    },
    {
      id: heading_1_id,
      type: 'heading',
      content: ['This is Svedit', []]
    },
    {
      id: paragraph_1_id,
      type: 'paragraph',
      content: ['A micro-library for building rich content editors with Svelte 5.', []]
    },
    {
      id: paragraph_2_id,
      type: 'paragraph',
      content: ['', []]
    },
    {
      id: story_1_id,
      type: 'story',
      layout: 1,
      image: '/images/editable.svg',
      title: ['Visual in‑place editing', []],
      description: ['Model your content in JSON, render it with Svelte components, and edit content directly in the layout. You only have to follow a couple of rules to make this work.', []]
    },
    {
      id: story_2_id,
      type: 'story',
      layout: 2,
      image: '/images/lightweight.svg',
      title: ['Minimal viable editor', []],
      description: ["The reference implementation uses only about 1000 lines of code. That means you'll be able to serve editable web pages, removing the need for a separate Content Management System.", [[100,118, "link", { "href": "https://editable.website"}]]]
    },
    {
      id: story_3_id,
      type: 'story',
      layout: 1,
      image: '/images/nested-blocks-illustration.svg',
      title: ['Nested nodes', []],
      description: ['A node can embed a node_array of other nodes. For instance the list node at the bottom of the page has a node_array of list items.', []]
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
      description: ['They work just like text cursors, but instead of a character position in a string they address a node position in a node_array.\n\nTry it by selecting one of the gaps between the nodes. Then press ↵ to insert a new node or ⌫ to delete the node before the cursor.', []]
    },
    {
      id: story_5_id,
      type: 'story',
      layout: 1,
      image: '/images/svelte-logo.svg',
      title: ['Made for Svelte 5', []],
      description: ['Integrate with your Svelte application. Use it as a template and copy and paste Svedit.svelte to build your custom rich content editor.', [ [20, 26, "link", {"href": "https://svelte.dev/"}], [80, 93, "emphasis", null] ]]
    },
    {
      id: story_6_id,
      type: 'story',
      layout: 2,
      image: '/images/extendable.svg',
      title: ['Alpha version', []],
      description: ['Expect bugs. Expect missing features. Expect the need for more work on your part to make this work for your use case.\n\nFind below a list of known issues we\'ll be working to get fixed next:', []]
    },
    {
      id: list_item_1_id,
      type: 'list_item',
      content: ['Images can not yet be selected and changed. We\'ll solve this by making any non‑text property selectable on the canvas, and show a popover (e.g. an image selector, or a math formula editor) to make changes, which will then be reflected in the canvas display immediately.', []]
    },
    {
      id: list_item_2_id,
      type: 'list_item',
      content: ['Node selections inside nested nodes (e.g. list items in this list) do not work reliably yet.', []]
    },
    {
      id: list_item_3_id,
      type: 'list_item',
      content: ['Only the latest Chrome is supported at the moment as we rely on CSS Anchor Positioning for overlays.', []]
    },
    {
      id: list_item_4_id,
      type: 'list_item',
      content: ['Full mobile support is considered in our design, but not yet implemented.', []]
    },
    {
      id: list_1_id,
      type: 'list',
      list_items: [list_item_1_id, list_item_2_id, list_item_3_id, list_item_4_id],
      list_style: 'decimal-leading-zero',
    },
    {
      id: story_7_id,
      type: 'story',
      layout: 1,
      image: '/images/github.svg',
      title: ['Star us on GitHub', []],
      description: ['Please star Svedit on GitHub or watch the repo to be notified about updates. Svedit is made by Michael Aufreiter and Johannes Mutter and is licensed under the MIT License.',
        [
          [0, 28, "link", {"href": "https://github.com/michael/svedit/", target: "_blank"}],
          [95, 112, "link", {"href": "https://michaelaufreiter.com", target: "_blank"}],
          [117,132, "link", {"href": "https://mutter.co", target: "_blank"}],
        ]
      ]
    },
    // IMPORTANT: The root node (entry point) must be the last one in the array
    {
      id: page_1_id,
      type: 'page',
      body: [paragraph_1_id, paragraph_2_id, story_1_id, story_2_id, image_grid_1_id, story_3_id, story_4_id, story_5_id, story_6_id, list_1_id, story_7_id],
      hero: hero_1_id,
      keywords: ['svelte', 'editor', 'rich content'],
      daily_visitors: [10, 20, 30, 100],
      created_at: '2025-05-30T10:39:59.987Z'
    },
  ];

  // App-specific config object, always available via doc.config for introspection
  const document_config = {
    // Those node types have horizontal-ish node_arrays
    // E.g. used by Overlays.svelte to render node cursors the right way.
    node_types_with_horizontal_node_arrays: ['image_grid'],
    // Custom functions to insert new "blank" nodes and setting the selection depening on the
    // intended behavior.
    inserters: {
      heading: function(tr, content = ['', []]) {
        const new_heading = {
     			id: svid(),
     			type: 'heading',
     			content
   		};
   		tr.insert_nodes([new_heading]);
        // NOTE: Relies on insert_nodes selecting the newly inserted node(s)
        tr.set_selection({
          type: 'text',
          path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1 , 'content'],
          anchor_offset: 0,
          focus_offset: 0
        });
      },
      paragraph: function(tr, content = ['', []]) {
        const new_paragraph = {
     			id: svid(),
     			type: 'paragraph',
     			content
    		};
    		tr.insert_nodes([new_paragraph]);
      // NOTE: Relies on insert_nodes selecting the newly inserted node(s)
        tr.set_selection({
          type: 'text',
          path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1 , 'content'],
          anchor_offset: 0,
          focus_offset: 0
        });
      },
      story: function(tr) {
        const new_story = {
          id: svid(),
          type: 'story',
          layout: 1,
          image: '',
          title: ['', []],
          description: ['', []]
        };
    		tr.insert_nodes([new_story]);
      // NOTE: Relies on insert_nodes selecting the newly inserted node(s)
        tr.set_selection({
          type: 'text',
          path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1, 'title'],
          anchor_offset: 0,
          focus_offset: 0
        });
      },
      list: function(tr) {
        const new_list_item = {
          id: svid(),
          type: 'list_item',
          content: ['New list item', []]
        };
        tr.create(new_list_item);
        const new_list = {
          id: svid(),
          type: 'list',
          list_items: [new_list_item.id],
          list_style: 'decimal-leading-zero',
        };
    		tr.insert_nodes([new_list]);
        tr.set_selection({
          type: 'text',
          path: [...tr.selection.path, tr.selection.focus_offset - 1, 'list_items', 0, 'content'],
          anchor_offset: 0,
          focus_offset: 0
        });
      },
      list_item: function(tr, content = ['', []]) {
        const new_list_item = {
          id: svid(),
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
            id: svid(),
            type: 'image_grid_item',
            title: ['', []],
            image: ''
          };
          tr.create(image_grid_item);
          new_image_grid_items.push(image_grid_item.id);
        }
        const new_image_grid = {
          id: svid(),
          type: 'image_grid',
          image_grid_items: new_image_grid_items,
        };
    		tr.insert_nodes([new_image_grid]);
      },
      image_grid_item: function(tr, content = ['', []]) {
        const new_image_grid_item = {
          id: svid(),
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
      hero: function(tr) {
        const new_hero = {
          id: svid(),
          type: 'hero',
          title: ['', []],
          description: ['', []],
          image: '',
        };
        tr.insert_nodes([new_hero]);
        tr.set_selection({
          type: 'text',
          path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1, 'title'],
          anchor_offset: 0,
          focus_offset: 0
        });
      }
    }
  };

  const doc = new Document(document_schema, raw_doc, { config: document_config });

  let svedit_ref;

  function focus_canvas() {
    if (svedit_ref) {
      svedit_ref.focus_canvas();
    }
  }
</script>

<svelte:head>
  <title>Svedit - A rich content editor for Svelte 5</title>
</svelte:head>

<div class="demo-wrapper">
  <Toolbar {doc} {focus_canvas} />
  <Svedit {doc} editable={true} class='flex-column' bind:this={svedit_ref}>
    <Hero path={[doc.document_id, 'hero']} />
    <NodeArrayProperty class="body-node-array" path={[doc.document_id, 'body']}>
      {#snippet node(node, path)}
        {#if node.type === 'heading'}
          <Heading {path} />
        {:else if node.type === 'paragraph'}
          <Paragraph {path} />
        {:else if node.type === 'story'}
          <Story {path} />
        {:else if node.type === 'list'}
          <List {path} />
        {:else if node.type === 'image_grid'}
          <ImageGrid {path} />
        {:else if node.type === 'hero'}
          <Hero {path} />
        {:else}
          <UnknownNode {path} />
        {/if}
      {/snippet}
    </NodeArrayProperty>

    {#snippet overlays()}
      <Overlays />
    {/snippet}
  </Svedit>

  <hr/>
  <div class='flex-column gap-y-2 my-10 w-full max-w-screen-lg mx-auto'>
    <p>Selection:</p>
    <pre class='debug-info p-4'>{JSON.stringify(doc.selection || {}, null, '  ')}</pre>
    <p>Nodes:</p>
    <pre class='debug-info p-4'>{JSON.stringify(doc.nodes, null, '  ')}</pre>
  </div>
</div>

<style>
  .demo-wrapper :global {
    .body-node-array {
      /* padding: var(--s-8); */
      display: grid;
      grid-template-columns: 1fr;
      /* gap: 1rem; */
    }
  }

  .debug-info {
    text-wrap: wrap;
    height: 12lh;
    overflow-y: auto;
    color: white;
    background: var(--primary-fill-color);
    font-size: 12px;
  }
</style>
