<script>
  import Text from '$lib/Text.svelte';
  import Surface from '$lib/Surface.svelte';
  import EntrySession from '$lib/EntrySession.svelte';

  let entry_session = new EntrySession({
    type: 'page',
    title: 'I am a heading',
    description: 'Some text here.',
    body: [
      {type: 'story', description: 'first para'},
      {type: 'story', description: 'second para'},
    ]
  });

</script>


<button onclick={() => entry_session.set(['body', 0, 'description'], 'lalalala la')}>Make a change</button>
<button onclick={() => entry_session.undo()}>Undo</button>
<button onclick={() => entry_session.redo()}>Redo</button>

<Surface {entry_session} editable={true}>
  <Text path={['title']} />

  <Text path={['body', 0, 'description']} />
</Surface>
