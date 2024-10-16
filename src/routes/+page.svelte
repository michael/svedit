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
    title: ['A template for building rich content editors with Svelte 5', [
      [24, 44, 'emphasis']
    ]],
    body: [
      { type: 'story', layout: 1, image: '/images/undraw_happy_feeling_re_e76r.svg', title: ['Visual in-place editing', []], description: ['Model your content in JSON, render it with Svelte components, and have text editable directly in the layout. Extend with custom components to render Vimeo Embeds, Forms, Tables, & more.', []] },
      { type: 'story', layout: 2, image: '/images/lightweight.svg', title: ['Lightweight', []], description: ['The reference implementation uses only about 1000 lines of code. That means you\'ll be able to serve editable web pages.', []] },
      { type: 'story', layout: 1, image: '/images/nested-blocks-illustration.svg', title: ['Nested blocks', []], description: ['A block can embed a container of other blocks. For instance the list block below has a container of list items.', []] },
      { type: 'story', layout: 2, image: '/images/container-cursors.svg', title: ['Container cursors', []], description: ['They work just like text cursors, but instead of a character position in a string they address a block position in a container.', []] },
      // -- 
      { type: 'story', layout: 1, image: '/images/svelte-logo.svg', title: ['Made for Svelte 5', []], description: ['Integrate with your Svelte application. Use it as a template and copy and paste Svedit.svelte to build your custom rich content editor.', [ [20, 26, "link", {"href": "https://svelte.dev/"}], [80, 93, "emphasis", null] ]] },
      { type: 'story', layout: 2, image: '/images/undraw_undraw_undraw_undraw_undraw_undraw_undraw_undraw_users_per_minute_1e4q_t22j_-1-_0ngf_-1-_27dv_30ul_legv_-1-_il1l_-2-_0jip.svg', title: ['Alpha version', []], description: ['Expect bugs. Expect missing features. Expect the need for more work on your part to make this work for your use case.', []] },
      {
        type: 'list',
        list_style: 'decimal-leading-zero',
        items: [
          { type: 'list_item', description: ['Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque commodo viverra mi sit amet semper. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.', []] },
          { type: 'list_item', description: ['Donec eget auctor nibh, vel porttitor mauris. Curabitur in feugiat ante. Mauris feugiat pellentesque quam, accumsan condimentum leo viverra nec. Nam scelerisque nisl at mauris rutrum sodales.', []] },
          { type: 'list_item', description: ['Integer auctor finibus turpis non egestas. Nullam eleifend odio magna, id vehicula est efficitur id. Suspendisse sem massa, congue condimentum nulla ut, fermentum tincidunt lectus.', []] },
          { type: 'list_item', description: ['Suspendisse pretium, neque et eleifend ultrices, leo mi tempor justo, et eleifend nisl nulla ac est.', []] },
          { type: 'list_item', description: ['Donec eget auctor nibh, vel porttitor mauris. Curabitur in feugiat ante. Mauris feugiat pellentesque quam, accumsan condimentum leo viverra nec. Nam scelerisque nisl at mauris rutrum sodales.', []] },
        ]
      },
    ]
  });

</script>

<div class="demo-wrapper pbs-6">
  <TextToolBar {entry_session} />


  <Svedit {entry_session} editable={true} class='flex-column gap-y-10'>
    <Text path={['title']} class='heading1' />
    <!-- NOTE: non-editable island must have contenteditable="false" and contain some text content, otherwise invalid selections occur. -->
    <div contenteditable="false" style="background: #eee; opacity: 0.5; padding: 20px;">
      <div>Some not editable UI...</div>
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
  
  <div class='flex-column gap-y-2 my-10'>
    <p>Selection:</p>
    <pre class='debug-info p-4'>{JSON.stringify(entry_session.selection || {}, null, '  ')}</pre>
    <p>Entry:</p>
    <pre class='debug-info p-4'>{JSON.stringify(entry_session.entry, null, '  ')}</pre>
  </div>
</div>

<style>
  .demo-wrapper {
    padding-inline: var(--s-10);
    max-width: 100ch;
    margin-inline: auto;
    background: var(--canvas-fill-color);

    /* We want a two column layout for the block container. */
    /* :global(.body) {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      width: 100%;
    } */

  }
  .debug-info {
    text-wrap: wrap;
    height: 10lh;
    overflow-y: auto;
    color: white;
    background: var(--primary-fill-color);
    font-size: 12px;
  }
</style>