<script>
  import StoryBlock from '$lib/StoryBlock.svelte';
  import ListBlock from '$lib/ListBlock.svelte';
  import UnknownBlock from '$lib/UnknownBlock.svelte';
  import Svedit from '$lib/Svedit.svelte';
  import Container from '$lib/Container.svelte';
  import TextToolBar from '$lib/TextToolBar.svelte';
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
    },
  };

  const story_1_id = svid();
  const page_1_id = svid();
  const list_1_id = svid();
  const list_item_1_id = svid();
  const list_item_2_id = svid();

  const raw_doc = [
    {
      id: story_1_id,
      type: 'story',
      layout: 1,
      image: '/images/editable.svg',
      title: ['Visual inplace editing', []],
      description: ['Model your content in JSON, render it with Svelte components, and edit content directly in the layout. You only have to follow a couple of rules to make this work.', []]
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
    // IMPORTANT: The root node (entry point) must be the last one in the array
    {
      id: page_1_id,
      type: 'page',
      body: [story_1_id, story_1_id, list_1_id],
      keywords: ['svelte', 'editor', 'rich content'],
      daily_visitors: [10, 20, 30, 100],
      created_at: '2025-05-30T10:39:59.987Z'
    },
  ];

  const doc = new SveditDoc(doc_schema, raw_doc);

  $effect(() => {
    // Test 1: Getting a multiref property should get you the raw ids
    const body =  doc.get([page_1_id, 'body']); // => ['nav_1', 'paragraph_1', 'list_1']
    console.log('body',$state.snapshot(body));

    // Test 2: Accessing a multiref by id should get you the resolved node
    const fist_story = doc.get([page_1_id, 'body', 0]); // => returns resolved node
    console.log('first story', $state.snapshot(fist_story));

    const fist_story_title = doc.get([page_1_id, 'body', 0, 'title']);
    console.log('first story title', $state.snapshot(fist_story_title));

    const daily_visitors = doc.get([page_1_id, 'daily_visitors']);
    console.log('daily visitors', $state.snapshot(daily_visitors));

    const daily_visitors_first_day = doc.get([page_1_id, 'daily_visitors', 0]);
    console.log('daily visitors first day', $state.snapshot(daily_visitors_first_day));

    const keywords = doc.get([page_1_id, 'keywords']);
    console.log('keywords', $state.snapshot(keywords));

    const first_keyword = doc.get([page_1_id, 'keywords', 0]);
    console.log('first_keyword', $state.snapshot(first_keyword));

    const list_items_of_first_list = doc.get([page_1_id, 'body', 2, 'list_items']);
    console.log('list_items_of_first_list', $state.snapshot(list_items_of_first_list));

    const first_list_item_content = doc.get([page_1_id, 'body', 2, 'list_items', 0, 'content']);
    console.log('first_list_item_content', $state.snapshot(first_list_item_content));
  });
</script>

<svelte:head>
  <title>Svedit - A rich content editor for Svelte 5</title>
</svelte:head>

<div class="demo-wrapper">
  <!-- <TextToolBar {entry_session} /> -->

  <Svedit {doc} editable={true} class='flex-column'>
    <Container class="body flex-column gap-y-10" path={[doc.doc_id, 'body']}>
      {#snippet block(block, path)}
        {#if block.type === 'story'}
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
  .demo-wrapper {
    /* no paddings or margins here on the body, so Blocks can use the full width (edge to edge layouts) */
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