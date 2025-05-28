<script>
  import StoryBlock from '$lib/StoryBlock.svelte';
  import ListBlock from '$lib/ListBlock.svelte';
  import UnknownBlock from '$lib/UnknownBlock.svelte';
  import Svedit from '$lib/Svedit.svelte';
  import Container from '$lib/Container.svelte';
  import TextToolBar from '$lib/TextToolBar.svelte';

  import doc_schema from '$lib/doc_schema.js';
  import SveditDoc from '$lib/SveditDoc.svelte.js';

  const raw_doc = [
    // {
    //   id: 'doc_nav_item_1',
    //   type: 'doc_nav_item',
    //   doc_id: 'page_1',
    //   label: 'Home',
    // },
    // {
    //   id: 'nav_1',
    //   type: 'nav',
    //   nav_items: ['doc_nav_item_1'],
    // },
    // {
    //   id: 'story_1',
    //   content: ['Hello world.', []],
    // },
    {
      id: 'story_1',
      type: 'story',
      layout: 1,
      image: '/images/editable.svg',
      title: ['Visual inplace editing', []],
      description: ['Model your content in JSON, render it with Svelte components, and edit content directly in the layout. You only have to follow a couple of rules to make this work.', []]
    },
    // {
    //   id: 'list_item_1',
    //   type: 'list_item',
    //   content: ['first list item', []],
    // },
    // {
    //   id: 'list_item_2',
    //   type: 'list_item',
    //   content: ['second list item', []],
    // },
    // {
    //   id: 'list_1',
    //   type: 'list',
    //   list_items: ['list_item_1', 'list_item_2'],
    // },
    // IMPORTANT: The root node (entry point) must be the last one in the array
    {
      id: 'page_1',
      type: 'page',
      body: [/*'nav_1', */'story_1', 'story_1' /*, 'list_1'*/],
    },
  ];


  const doc = new SveditDoc(doc_schema, raw_doc);


  // get the body (=array of node ids)
  // const body =  doc.get(['page_1', 'body']); // => ['nav_1', 'paragraph_1', 'list_1']
  // console.log($state.snapshot(body));
  // const nav = doc.get(['nav_1']) // => { id: 'nav_1', type: 'nav', nav_items: ['document_nav_item_1'] }
  // console.log('nav.nav_items before:', $state.snapshot(nav.nav_items));
  // // Delete the last nav item and store in the graph
  // const new_nav_items = nav.nav_items.splice(0, -1);
  // doc.set(['nav_1', 'nav_items'], new_nav_items);
  // console.log('nav.nav_items after:', $state.snapshot(nav.nav_items));

  // const flat_description = doc.get(['story_1', 'description']);
  // console.log('flat_description:', $state.snapshot(flat_description));

  // const deep_description = doc.get(['page_1', 'body', 0, 'description']);
  // console.log('deep_description:', $state.snapshot(deep_description));

  // const story_node_flat = doc.get(['story_1']);
  // console.log('story_node_flat:', $state.snapshot(story_node_flat));
  // const story_node_deep = doc.get(['page_1', 'body', 0]);
  // console.log('story_node_deep:', $state.snapshot(story_node_deep));

  $effect(() => {
    console.log('serialized_doc', doc.to_json());
  })
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