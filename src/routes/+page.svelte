<script>
  import Text from '$lib/Text.svelte';
  import StoryBlock from '$lib/StoryBlock.svelte';
  import ListBlock from '$lib/ListBlock.svelte';
  import UnknownBlock from '$lib/UnknownBlock.svelte';
  import Svedit from '$lib/Svedit.svelte';
  import Container from '$lib/Container.svelte';
  import EntrySession from '$lib/EntrySession.svelte';
  import TextToolBar from '$lib/TextToolBar.svelte';
  let entry_session = new EntrySession({
    type: 'page',
    title: ['Svedit', []],
    subtitle: ['A template for building rich content editors with Svelte 5', [
      [24, 44, 'emphasis']
    ]],
    body: [
      { type: 'story', layout: 1, image: '/images/editable.svg', title: ['Visual in‑place editing', []], description: ['Model your content in JSON, render it with Svelte components, and edit content directly in the layout. You only have to follow a couple of rules to make this work.', []] },
      { type: 'story', layout: 2, image: '/images/lightweight.svg', title: ['Minimal viable editor', []], description: ["The reference implementation uses only about 1000 lines of code. That means you'll be able to serve editable web pages, removing the need for a separate Content Management System.", [[100,118, "link", { "href": "https://editable.website"}]]] },
      { type: 'story', layout: 1, image: '/images/nested-blocks-illustration.svg', title: ['Nested blocks', []], description: ['A block can embed a container of other blocks. For instance the list block at the bottom of the page has a container of list items.', []] },
      { type: 'story', layout: 2, image: '/images/container-cursors.svg', title: ['Container cursors', []], description: ['They work just like text cursors, but instead of a character position in a string they address a block position in a container.\n\nTry it by selecting a few blocks, then press ↑ or ↓. Press ↵ to insert a new block or ⌫ to delete the block before the cursor.', []] },
      { type: 'story', layout: 1, image: '/images/svelte-logo.svg', title: ['Made for Svelte 5', []], description: ['Integrate with your Svelte application. Use it as a template and copy and paste Svedit.svelte to build your custom rich content editor.', [ [20, 26, "link", {"href": "https://svelte.dev/"}], [80, 93, "emphasis", null] ]] },
      { type: 'story', layout: 2, image: '/images/extendable.svg', title: ['Alpha version', []], description: ['Expect bugs. Expect missing features. Expect the need for more work on your part to make this work for your use case.\n\nFind below a list of known issues we\'ll be working to get fixed next:', []] },
      {
        type: 'list',
        list_style: 'decimal-leading-zero',
        items: [
          { type: 'list_item', description: ['Images can not yet be selected and changed. We\'ll solve this by making any non‑text property selectable on the canvas, and show a popover (e.g. an image selector, or a math formula editor) to make changes, which will then be reflected in the canvas display immediately.' , []] },
          { type: 'list_item', description: ['Container selections inside nested blocks (e.g. list items in this list) do not work reliably yet.', []] },
          { type: 'list_item', description: ['Only the latest Chrome is supported at the moment as we rely on CSS Anchor Positioning for overlays.', []] },
          { type: 'list_item', description: ['Full mobile support is considered in our design, but not yet implemented.', []] },
        ]
      },
      {
        type: 'story',
        layout: 1,
        editable: false,
        image: '/images/github.svg',
        title: ['Star us on GitHub', []],
        description: ['Please star Svedit on GitHub or watch the repo to be notified about updates. Svedit is made by Michael Aufreiter and Johannes Mutter and is licensed under the MIT License.', 
          [
            [0, 28, "link", {"href": "https://github.com/michael/svedit/", target: "_blank"}],
            [95, 112, "link", {"href": "https://michaelaufreiter.com", target: "_blank"}],
            [117,132, "link", {"href": "https://mutter.co", target: "_blank"}],
          ]
        ]
      },
    ]
  });
</script>

<svelte:head>
  <title>Svedit - A rich content editor for Svelte 5</title>
  <script async defer src="https://buttons.github.io/buttons.js"></script>
</svelte:head>

<div class="demo-wrapper">
  <TextToolBar {entry_session} />

  <Svedit {entry_session} editable={true} class='flex-column'>
    <div class='flex-column gap-y-10 p-10 max-w-screen-lg mx-auto w-full'>
      <div class='flex-row flex-wrap gap-5 items-center'>
        <Text path={['title']} class='heading1 m-0' />
        <a class="github-button" href="https://github.com/michael/svedit" data-color-scheme="no-preference: light; light: light; dark: dark;" data-size="large" data-show-count="true" aria-label="Star michael/svedit on GitHub">Star</a>
      </div>
      <Text path={['subtitle']} class='heading3' />
    </div>
    <!-- NOTE: non-editable island must have contenteditable="false" and contain some text content, otherwise invalid selections occur. -->
    <div contenteditable="false" style="background: #eee; opacity: 0.5;" class='p-10 max-w-screen-lg mx-auto'>
      <div><div>In this example the title and subtitle above are editable, but this piece of content here is not. Below is a container of Story and List blocks:</div></div>
    </div>
    <Container class="body flex-column gap-y-10" path={['body']}>
      {#snippet block(block, path)}
        {#if block.type === 'story'}
          <StoryBlock {block} {path} />
        {:else if block.type === 'list'}
          <ListBlock {block} {path} />
        {:else}
          <UnknownBlock {block} {path} />
        {/if}
      {/snippet}
    </Container>
  </Svedit>

  <hr/>
  
  <div class='flex-column gap-y-2 my-10 w-full max-w-screen-lg mx-auto'>
    <p>Selection:</p>
    <pre class='debug-info p-4'>{JSON.stringify(entry_session.selection || {}, null, '  ')}</pre>
    <p>Entry:</p>
    <pre class='debug-info p-4'>{JSON.stringify(entry_session.entry, null, '  ')}</pre>
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