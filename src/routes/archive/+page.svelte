<script>
  import Text from '$lib/Text.svelte';
  import Surface from '$lib/Surface.svelte';
  // import Container from '$lib/Container.svelte';
  
  let entry = $state({
    title: 'I am a heading',
    description: 'Some text here.',
    body: [
      {type: 'story', description: 'first para'},
      {type: 'story', description: 'second para'},
    ]
  });
</script>

<!--
  A Surface wraps an editable canvas, and manages the data structure, keeps a history as well as handles undo/redo.
  All input events are handled by the surface, and the surface updates the data structure, which triggers signals
  which then updates the UI
-->
<Surface bind:entry editable={true}>
  <h1 contenteditable="false">Not editable UI-related text</h1>
  <Text path='title'></Text>
  <Text path='title'></Text>
  <div contenteditable="false">Some more not editable UI-related text</div>
  <Text path='description'></Text>
  
</Surface>

<div contenteditable="true" tabindex="-1">BLOCKFOCUSTRAP</div>