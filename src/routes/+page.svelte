<script>
  import StoryBlock from '$lib/StoryBlock.svelte';
  import ParagraphBlock from '$lib/ParagraphBlock.svelte';
  import ListBlock from '$lib/ListBlock.svelte';
  import UnknownBlock from '$lib/UnknownBlock.svelte';
  import Svedit from '$lib/Svedit.svelte';
  import Container from '$lib/Container.svelte';
  import Toolbar from '$lib/Toolbar.svelte';
  import SveditDoc from '$lib/SveditDoc.svelte.js';
  import { svid } from '$lib/util.js';

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
      list_style: { type: 'string' },
    },
  };

  // Generate IDs for all content nodes
  const page_1_id = svid();
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
      id: paragraph_1_id,
      type: 'paragraph',
      content: ['Welcome to Svedit! This is a paragraph block with simple text content. Try editing this text directly by clicking on it.', []]
    },
    {
      id: paragraph_2_id,
      type: 'paragraph',
      content: ['Here is another paragraph.', []]
    },
    {
      id: story_1_id,
      type: 'story',
      layout: 1,
      image: '/images/editable.svg',
      title: ['Visual in-place editing', []],
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
      body: [paragraph_1_id, paragraph_2_id, story_1_id, story_2_id, story_3_id, story_4_id, story_5_id, story_6_id, list_1_id, story_7_id],
      keywords: ['svelte', 'editor', 'rich content'],
      daily_visitors: [10, 20, 30, 100],
      created_at: '2025-05-30T10:39:59.987Z'
    },
  ];

  // App-specific config object, always available via doc.config for introspection
  const doc_config = {
    // Those node types have horizontal-ish containers
    // E.g. used by Overlays.svelte to render container cursors the right way.
    node_types_with_horizontal_containers: ['page']
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
    <Container class="body-container" path={[doc.doc_id, 'body']}>
      {#snippet block(block, path)}
        {#if block.type === 'paragraph'}
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

  /* Render container cursor for .body */
  .demo-wrapper :global {
    .svedit-canvas > .body-container > .block > .cursor-trap {
      position: absolute;
      right: -6px;
      top: 0;
      bottom: 0;
      width: 12px;
      z-index: 1000;
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
