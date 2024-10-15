<script>
  import Text from '$lib/Text.svelte';
  import StoryBlock from '$lib/StoryBlock.svelte';
  import ListBlock from '$lib/ListBlock.svelte';
  import UnknownBlock from '$lib/UnknownBlock.svelte';
  import Svedit from '$lib/Svedit.svelte';
  import Container from '$lib/Container.svelte';
  import EntrySession from '$lib/EntrySession.svelte';

  let entry_session = new EntrySession({
    type: 'page',
    title: ['A template for building rich content editors with Svelte 5', [
      [6, 11, 'emphasis']
    ]],
    body: [
      { type: 'story', image: '/images/undraw_happy_feeling_re_e76r.svg', title: ['In-place editing', []], description: ['Model your content in JSON, render it with Svelte components, and have text editable directly in the layout. You only have to follow a few rules.', []] },
      { type: 'story', image: '/images/undraw_landscape_photographer_blv1.svg', title: ['Container cursors', []], description: ['They work just like text cursors, but instead of a character position in a string they address a block position in a container.', []] },
      { type: 'story', image: '/images/undraw_personal_finance_re_ie6k.svg', title: ['Lightweight', []], description: ['The reference implementation uses only about 1000 lines of code. That means you\'ll be able to serve editable web pages.', []] },
      { type: 'story', image: '/images/undraw_undraw_messaging_7ho8_-2-_5g7e.svg', title: ['Nested blocks', []], description: ['A block can embed a container of other blocks. For instance the list block below has a container of list items.', []] },
      // -- 
      { type: 'story', image: '/images/undraw_undraw_undraw_undraw_undraw_undraw_undraw_undraw_users_per_minute_1e4q_t22j_-1-_0ngf_-1-_27dv_30ul_legv_-1-_il1l_-2-_0jip.svg', title: ['Alpha version', []], description: ['Donec eget auctor nibh, vel porttitor mauris. Curabitur in feugiat ante. Mauris feugiat pellentesque quam, accumsan condimentum leo viverra nec.', []] },
      { type: 'story', image: '/images/undraw_winter_skating_re_qouk.svg', title: ['Lorem ipsum dolor sit', []], description: ['Donec eget auctor nibh, vel porttitor mauris. Curabitur in feugiat ante. Mauris feugiat pellentesque quam, accumsan condimentum leo viverra nec.', []] },
      {
        type: 'list',
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


  function insert_link() {
    entry_session.annotate_text('link', {
      href: window.prompt('Enter the URL')
    });
  }

</script>

<div class="demo-wrapper">
  {#if entry_session.selection}
    <div class="editor-menu">
      <!-- Editor menu -->
      <button onclick={() => entry_session.undo()}>Undo</button>
      <button onclick={() => entry_session.redo()}>Redo</button>
      <button onclick={() => entry_session.annotate_text('strong')} disabled={entry_session.active_annotation() && entry_session.active_annotation()?.[2] !== 'strong'}>Bold</button>
      <button onclick={() => entry_session.annotate_text('emphasis')} disabled={entry_session.active_annotation() && entry_session.active_annotation()?.[2] !== 'emphasis'}>Italic</button>
      <button onclick={insert_link} disabled={entry_session.active_annotation()}>Link</button>
    </div>
  {/if}


  <Svedit {entry_session} editable={true}>
    <div style="display: flex; flex-direction: column; gap: 20px; padding-top: 10px;">
      <Text path={['title']} />
      <!-- NOTE: non-editable island must have contenteditable="false" and contain some text content, otherwise invalid selections occur. -->
      <div contenteditable="false" style="background: #eee; opacity: 0.5; padding: 20px;">
        <div>Some not editable UI...</div>
      </div>
      <Container class="body" path={['body']}>
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
    </div>
  </Svedit>
  <hr/>
  <pre style="text-wrap: wrap; height: 120px; overflow-y: auto; color: white; background: black;">
    <code>Selection: {JSON.stringify(entry_session.selection)}</code><br/><br/>
    <code>Entry: {JSON.stringify(entry_session.entry, null, '  ')}</code>
  </pre>
</div>

<style>
  .demo-wrapper {

    .editor-menu {
      background: #fff;
      height: 44px;
      z-index: 50;
    }
    /* scroll-padding: 1em; */
    &:not(:has(.editor-menu)) {
      padding-top: 100px;
    }

    /* We want a two column layout for the block container. */
    /* :global(.body) {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      width: 100%;
    } */

    :global(.svedit-canvas) {
      padding: 20px;
    }

    .editor-menu {
      background: white;
      padding: 10px 20px;
      position: fixed;
      top: 0px;
      left: 0px;
      right: 0px;
      border-bottom: 1px solid #ddd;
    }

    :global(em) {
      font-style: italic;
    }

    :global(strong) {
      font-weight: bold;
    }

    :global(a) {
      text-decoration: underline;
      color: black;
    }
  }
</style>