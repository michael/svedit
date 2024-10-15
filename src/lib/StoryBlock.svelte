<script>
  import Text from '$lib/Text.svelte';

  let {
    path
  } = $props();
</script>

<div
  class="story-block"
  data-path={path.join('.')}
  data-type="block"
  data-index={path.at(-1)}
  style="anchor-name: --{path.join('-')};"
>
  <div contenteditable="false">
    <!-- svelte-ignore a11y_img_redundant_alt -->
    <img src="https://picsum.photos/160/90" alt="Random image" />
  </div>
  <div class="caption">
    <!-- ATTENTION: Do not format the following lines, as whitespace will mess up contenteditable -->
    <div class="title"><Text path={[...path,'title']} /></div>
    <div class="description"><Text path={[...path,'description']} /></div>
  </div>
</div>

<style>
  .story-block {
    display: flex;
  }

  .caption {
    padding-left: 20px;
  }

  .title {
    font-size: 1.5em;
    font-weight: bold;
  }

  .description {
    font-size: 1em;
    font-weight: normal;
  }
</style>