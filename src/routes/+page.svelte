<script>
  import Svedit from '$lib/Svedit.svelte';
  import SveditDoc from '$lib/SveditDoc.svelte.js';
  import Container from '$lib/Container.svelte';
  import { svid } from '$lib/util.js';

  import StoryBlock from './components/StoryBlock.svelte';
  import ParagraphBlock from './components/ParagraphBlock.svelte';
  import HeadingBlock from './components/HeadingBlock.svelte';
  import ListBlock from './components/ListBlock.svelte';
  import UnknownBlock from './components/UnknownBlock.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import Overlays from './components/Overlays.svelte';

  const doc_schema = {
    page: {
      body: {
        type: 'multiref',
        ref_types: ['heading', 'paragraph', 'story', 'list'],
        default_ref_type: 'paragraph',
      },
      cover_story: {
        type: 'ref',
        ref_types: ['story'],
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
    heading: {
      content: { type: 'annotated_text' },
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
      list_style: { type: 'string' },
    },
  };

  // Generate IDs for all content nodes
  const page_1_id = svid();
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

  const raw_doc = [
    {
      id: heading_1_id,
      type: 'heading',
      content: ['Welcome to Svedit', []]
    },
    {
      id: paragraph_1_id,
      type: 'paragraph',
      content: ['This is a paragraph block with simple text content. Try editing this text directly by clicking on it.', []]
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
      title: ['', []],
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
      title: ['Nested blocks', []],
      description: ['A block can embed a container of other blocks. For instance the list block at the bottom of the page has a container of list items.', []]
    },
    {
      id: story_4_id,
      type: 'story',
      layout: 2,
      image: '/images/container-cursors.svg',
      title: ['Container cursors', []],
      description: ['They work just like text cursors, but instead of a character position in a string they address a block position in a container.\n\nTry it by selecting a few blocks, then press ↑ or ↓. Press ↵ to insert a new block or ⌫ to delete the block before the cursor.', []]
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
      content: ['Container selections inside nested blocks (e.g. list items in this list) do not work reliably yet.', []]
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
      body: [heading_1_id, paragraph_1_id, paragraph_2_id, story_1_id, story_2_id, story_3_id, story_4_id, story_5_id, story_6_id, list_1_id, story_7_id],
      cover_story: story_1_id,
      keywords: ['svelte', 'editor', 'rich content'],
      daily_visitors: [10, 20, 30, 100],
      created_at: '2025-05-30T10:39:59.987Z'
    },
  ];

  // App-specific config object, always available via doc.config for introspection
  const doc_config = {
    // Those node types have horizontal-ish containers
    // E.g. used by Overlays.svelte to render container cursors the right way.
    node_types_with_horizontal_containers: ['page'],
    // Custom functions to insert new "blank" nodes and setting the selection depening on the
    // intended behavior.
    inserters: {
      heading: function(tr, content = ['', []]) {
        const new_heading = {
     			id: svid(),
     			type: 'heading',
     			content
   		};
   		tr.insert_blocks([new_heading]);
        // NOTE: Relies on insert_blocks selecting the newly inserted block(s)
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
    		tr.insert_blocks([new_paragraph]);
        // NOTE: Relies on insert_blocks selecting the newly inserted block(s)
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
    		tr.insert_blocks([new_story]);
      // NOTE: Relies on insert_blocks selecting the newly inserted block(s)
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
    		tr.insert_blocks([new_list]);
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
    		tr.insert_blocks([new_list_item]);
        console.log('xxx', [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1 , 'content']);
        tr.set_selection({
          type: 'text',
          path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1 , 'content'],
          anchor_offset: 0,
          focus_offset: 0
        });
      }
    }
  };

  const doc = new SveditDoc(doc_schema, raw_doc, { config: doc_config });

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
    <StoryBlock path={[doc.doc_id, 'cover_story']} />
    <Container class="body-container" path={[doc.doc_id, 'body']}>
      {#snippet block(block, path)}
        {#if block.type === 'heading'}
          <HeadingBlock {path} />
        {:else if block.type === 'paragraph'}
          <ParagraphBlock {path} />
        {:else if block.type === 'story'}
          <StoryBlock {path} />
        {:else if block.type === 'list'}
          <ListBlock {path} />
        {:else}
          <UnknownBlock {path} />
        {/if}
      {/snippet}
    </Container>

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
    .body-container {
      padding: var(--s-8);
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
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
