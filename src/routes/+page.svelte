<script>
  import Text from '$lib/Text.svelte';
  import Surface from '$lib/Surface.svelte';
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
      { type: 'story', title: ['A story title', []], description: ['A story description', []] },
      { type: 'story', title: ['A story title', []], description: ['A story description', []] },
    ]
  });

  function insert_link() {
    entry_session.annotate_text('link', {
      href: window.prompt('Enter the URL')
    });
  }
</script>


<div class="demo-wrapper">
  <button onclick={() => entry_session.undo()}>Undo</button>
  <button onclick={() => entry_session.redo()}>Redo</button>
  <button onclick={() => entry_session.annotate_text('strong')} disabled={entry_session.active_annotation() && entry_session.active_annotation()?.[2] !== 'strong'}>Bold</button>
  <button onclick={() => entry_session.annotate_text('emphasis')} disabled={entry_session.active_annotation() && entry_session.active_annotation()?.[2] !== 'emphasis'}>Italic</button>
  <button onclick={insert_link} disabled={entry_session.active_annotation()}>Link</button>

  <Surface {entry_session} editable={true}>
    <div style="display: flex; flex-direction: column; gap: 20px; padding-top: 10px;">
      <Text path={['title']} />
      <!-- Important: div must have contenteditable="false" and contain some content, otherwise invalid selections occur. -->
      <div contenteditable="false" style="background: #eee; opacity: 0.5; padding: 20px;">
        <div>Some not editable UI...</div>
      </div>
      <Text path={['description']} />
      <Container path={['body']} />
    </div>
  </Surface>
  <hr/>
  <pre style="text-wrap: wrap;"><code>Document: {JSON.stringify(entry_session.entry)}</code><br/><br/><code>Selection: {JSON.stringify(entry_session.selection)}</code></pre>
</div>

<style>
  .demo-wrapper {
    padding: 20px;
  }
</style>