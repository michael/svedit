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
  class="story-block layout-{block.layout} p-2"
  data-path={path.join('.')}
  data-type="block"
  data-index={path.at(-1)}
  style="anchor-name: --{path.join('-')};"
>
  <div class='non-text-content' contenteditable="false">
    <!-- svelte-ignore a11y_img_redundant_alt -->
    <img src={block.image} alt="Random image" />
  </div>
  <div class="caption">
    <!-- ATTENTION: Do not format the following lines, as whitespace will mess up contenteditable -->
    <Text class='heading2' path={[...path,'title']} />
    <Text class='body' path={[...path,'description']} />
  </div>
</div>

<style>
  .story-block {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(30ch, 100%), 1fr));
    gap: var(--s-10);
    img {
      width: 100%;
      height: auto;
      /* Don't crop SVGs */
      &[src*=".svg"] {
        object-fit: contain;
        object-position: center;
      }
    }
  }

  .non-text-content {
    /* for now ignore clicks on the image, until we have non-text selections */
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 30ch;
    @media (max-width: 768px) {
      min-width: 100%;
    }
  }

  /* Layout styles */
  .story-block.layout-2, .story-block.layout-1 {
    align-items: center;
  }

  .story-block.layout-2 > div:first-child {
    order: 2;
  }

  .story-block.layout-2 > div:last-child {
    order: 1;
  }

  .story-block.layout-3 > div:first-child {
    grid-column: 1 / 3;
    grid-row: 1 / 2;
  }

  .story-block.layout-3 > div:last-child {
    grid-column: 1 / 3;
    grid-row: 2 / 3;
  }
</style>
