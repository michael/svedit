<script>
  import Story from '$lib/Story.svelte';
  import { getContext } from 'svelte';

  const surface = getContext('surface');

  let {
    path
  } = $props();

  
</script>

<div contenteditable="false" data-type="container" data-path={path.join('.')}>
  {#each surface.entry_session.get(path) as child, index}
    <Story path={[...path, index]} />
  {/each}
</div>

<style>
  div {
    white-space: pre;
  }
</style>