<script>
  import { getContext } from 'svelte';
  import Text from '$lib/Text.svelte';
  const svedit = getContext('svedit');

  let {
    path
  } = $props();

  let block = $derived(svedit.entry_session.get(path));
</script>

<div
  class="story-block"
  data-path={path.join('.')}
  data-type="block"
  data-index={path.at(-1)}
  style="anchor-name: --{path.join('-')};"
  class:layout-2={block.layout === 2}
>
  <div contenteditable="false">
    <!-- svelte-ignore a11y_img_redundant_alt -->
    <img width="300" height="300" src={block.image} alt="Random image" />
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
    flex-direction: row;
    align-items: center;
  }

  .story-block.layout-2 {
    flex-direction: row-reverse;
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