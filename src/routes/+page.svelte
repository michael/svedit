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
    title: ['Hello world', [
      [6, 11, 'emphasis']
    ]],
    description: ['Some text here', [
      [5, 9, 'link', {href: 'https://www.google.com'}]
    ]],
    body: [
      { type: 'story', title: ['A story title 1', []], description: ['A story description 1', []] },
      { type: 'story', title: ['A story title 2', []], description: ['A story description 2', []] },
      { type: 'story', title: ['A story title 3', []], description: ['', []] },
      { type: 'story', title: ['A story title 4', []], description: ['A story description 4', []] },
      // -- 
      { type: 'story', title: ['A story title 5', []], description: ['A story description 5', []] },
      { type: 'story', title: ['A story title 6', []], description: ['A story description 6', []] },
      { type: 'story', title: ['A story title 7', []], description: ['A story description 7', []] },
      { type: 'story', title: ['A story title 8', []], description: ['A story description 8', []] },
      { type: 'story', title: ['A story title 9', []], description: ['A story description 9', []] },
      { type: 'story', title: ['A story title 10', []], description: ['A story description 10', []] },
      { type: 'story', title: ['A story title 11', []], description: ['A story description 11', []] },
      { type: 'story', title: ['A story title 12', []], description: ['A story description 12', []] },
      { type: 'story', title: ['A story title 13', []], description: ['A story description 13', []] },
      { type: 'story', title: ['A story title 14', []], description: ['A story description 14', []] },
      { type: 'story', title: ['A story title 15', []], description: ['A story description 15', []] },
      {
        type: 'list',
        items: [
          { type: 'list_item', description: ['List item 1', []] },
          { type: 'list_item', description: ['List item 2', []] },
          { type: 'list_item', description: ['List item 3', []] },
        ]
      },
      { type: 'story', title: ['A story title 16', []], description: ['A story description 16', []] },
      { type: 'story', title: ['A story title 17', []], description: ['A story description 17', []] },
      { type: 'story', title: ['A story title 18', []], description: ['A story description 18', []] },
    ]
  });

  function insert_link() {
    entry_session.annotate_text('link', {
      href: window.prompt('Enter the URL')
    });
  }

  function select_first_two_blocks() {
    entry_session.selection = {
      type: 'container',
      path: ['body', 15, 'items'],
      anchor_offset: 1,
      focus_offset: 2,
    }
  }
</script>


<div class="demo-wrapper">
  <!-- Editor menu -->
  <button onclick={() => entry_session.undo()}>Undo</button>
  <button onclick={() => entry_session.redo()}>Redo</button>
  <button onclick={select_first_two_blocks}>select blocks</button>
  <button onclick={() => entry_session.annotate_text('strong')} disabled={entry_session.active_annotation() && entry_session.active_annotation()?.[2] !== 'strong'}>Bold</button>
  <button onclick={() => entry_session.annotate_text('emphasis')} disabled={entry_session.active_annotation() && entry_session.active_annotation()?.[2] !== 'emphasis'}>Italic</button>
  <button onclick={insert_link} disabled={entry_session.active_annotation()}>Link</button>

  <Svedit {entry_session} editable={true}>
    <div style="display: flex; flex-direction: column; gap: 20px; padding-top: 10px;">
      <Text path={['title']} />
      <!-- NOTE: non-editable island must have contenteditable="false" and contain some text content, otherwise invalid selections occur. -->
      <div contenteditable="false" style="background: #eee; opacity: 0.5; padding: 20px;">
        <div>Some not editable UI...</div>
      </div>
      <Text path={['description']} />
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
  <pre style="text-wrap: wrap;"><code>Entry: {JSON.stringify(entry_session.entry)}</code><br/><br/><code>Selection: {JSON.stringify(entry_session.selection)}</code></pre>
</div>


<style>
  .demo-wrapper {
    padding: 20px;

    /* We want a two column layout for the block container. */
    :global(.body) {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      width: 100%;
    }
  }
</style>