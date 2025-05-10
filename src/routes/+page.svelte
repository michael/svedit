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


  // let entry_session = new EntrySession({
  //   type: 'page',
  //   title: ['Svedit', []],
  //   subtitle: ['A template for building rich content editors with Svelte 5', [
  //     [24, 44, 'emphasis']
  //   ]],
  //   body: [
  //     { type: 'story', layout: 1, image: '/images/editable.svg', title: ['Visual in‑place editing', []], description: ['Model your content in JSON, render it with Svelte components, and edit content directly in the layout. You only have to follow a couple of rules to make this work.', []] },
  //     { type: 'story', layout: 2, image: '/images/lightweight.svg', title: ['Minimal viable editor', []], description: ["The reference implementation uses only about 1000 lines of code. That means you'll be able to serve editable web pages, removing the need for a separate Content Management System.", [[100,118, "link", { "href": "https://editable.website"}]]] },
  //     { type: 'story', layout: 1, image: '/images/nested-blocks-illustration.svg', title: ['Nested blocks', []], description: ['A block can embed a container of other blocks. For instance the list block at the bottom of the page has a container of list items.', []] },
  //     { type: 'story', layout: 2, image: '/images/container-cursors.svg', title: ['Container cursors', []], description: ['They work just like text cursors, but instead of a character position in a string they address a block position in a container.\n\nTry it by selecting a few blocks, then press ↑ or ↓. Press ↵ to insert a new block or ⌫ to delete the block before the cursor.', []] },
  //     { type: 'story', layout: 1, image: '/images/svelte-logo.svg', title: ['Made for Svelte 5', []], description: ['Integrate with your Svelte application. Use it as a template and copy and paste Svedit.svelte to build your custom rich content editor.', [ [20, 26, "link", {"href": "https://svelte.dev/"}], [80, 93, "emphasis", null] ]] },
  //     { type: 'story', layout: 2, image: '/images/extendable.svg', title: ['Alpha version', []], description: ['Expect bugs. Expect missing features. Expect the need for more work on your part to make this work for your use case.\n\nFind below a list of known issues we\'ll be working to get fixed next:', []] },
  //     {
  //       type: 'list',
  //       list_style: 'decimal-leading-zero',
  //       items: [
  //         { type: 'list_item', description: ['Images can not yet be selected and changed. We\'ll solve this by making any non‑text property selectable on the canvas, and show a popover (e.g. an image selector, or a math formula editor) to make changes, which will then be reflected in the canvas display immediately.' , []] },
  //         { type: 'list_item', description: ['Container selections inside nested blocks (e.g. list items in this list) do not work reliably yet.', []] },
  //         { type: 'list_item', description: ['Only the latest Chrome is supported at the moment as we rely on CSS Anchor Positioning for overlays.', []] },
  //         { type: 'list_item', description: ['Full mobile support is considered in our design, but not yet implemented.', []] },
  //       ]
  //     },
  //     {
  //       type: 'story',
  //       layout: 1,
  //       editable: false,
  //       image: '/images/github.svg',
  //       title: ['Star us on GitHub', []],
  //       description: ['Please star Svedit on GitHub or watch the repo to be notified about updates. Svedit is made by Michael Aufreiter and Johannes Mutter and is licensed under the MIT License.', 
  //         [
  //           [0, 28, "link", {"href": "https://github.com/michael/svedit/", target: "_blank"}],
  //           [95, 112, "link", {"href": "https://michaelaufreiter.com", target: "_blank"}],
  //           [117,132, "link", {"href": "https://mutter.co", target: "_blank"}],
  //         ]
  //       ]
  //     },
  //   ]
  // });
</script>

<svelte:head>
  <title>Svedit - A rich content editor for Svelte 5</title>
</svelte:head>

<div class="demo-wrapper">
  <!-- <TextToolBar {entry_session} /> -->

  <Svedit {doc} editable={true} class='flex-column'>
    <Container class="body flex-column gap-y-10" path={['page_1', 'body']}>
      {#snippet block(block, index)}
        {#if block.type === 'story'}
          <StoryBlock {block} {index} />
        {:else if block.type === 'list'}
          <ListBlock {block} {index} />
        {:else}
          <UnknownBlock {block} {index} />
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