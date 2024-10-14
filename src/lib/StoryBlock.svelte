<script>
  import Text from '$lib/Text.svelte';

  let {
    path
  } = $props();
</script>

<div
  data-path={path.join('.')}
  data-type="block"
  data-index={path.at(-1)}
  style="anchor-name: --{path.join('-')};"
>
  <!-- ATTENTION: Do not format the following lines, as whitespace will mess up contenteditable -->
  <div class="title"><Text path={[...path,'title']} /></div>
  <div class="description"><Text path={[...path,'description']} /></div>
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