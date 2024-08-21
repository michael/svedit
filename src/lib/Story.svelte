<script>
  import Text from '$lib/Text.svelte';
  import { getContext } from 'svelte';

  const surface = getContext('surface');

  let {
    path
  } = $props();

  
</script>

<div contenteditable="false">

  <div>Block: {JSON.stringify(path)}</div>
  <div class="title">
    <Text path={[...path,'title']} />
  </div>
  <div class="description">
    <Text path={[...path,'description']} />
  </div>
</div>

<style>
  .title {
    font-size: 1.5em;
    font-weight: bold;
  }

  .description {
    font-size: 1em;
    font-weight: normal;
  }
</style>