<script>
  import { getContext } from 'svelte';
  import Text from '$lib/Text.svelte';
  const svedit = getContext('svedit');

  let {
    block,
    index,
  } = $props();
  // let block = $derived(svedit.doc.get(path));
</script>

<div
  class="story-block layout-{block.layout} max-w-screen-lg mx-auto w-full"
  data-path={block.id}
  data-type="block"
  data-index={index}
  style="anchor-name: --{block.id};"
>
  <div
    class='non-text-content' 
    contenteditable="false"
  >
    <!-- svelte-ignore a11y_img_redundant_alt -->
    <img src={block.image} alt={block.title[0]} />
  </div>
  <div class="caption">
    <!-- ATTENTION: Do not format the following lines, as whitespace will mess up contenteditable -->
    <Text class='heading2' path={[block.id,'title']} editable={block.editable} />
    <Text class='body' path={[block.id,'description']} editable={block.editable} />
  </div>
</div>

<style>
  .story-block {
    container-type: inline-size;
    display: grid;
    grid-template-columns: 1fr;      
    /* Apply padding on the sides of the block, but only on devices that need it, e.g. iPhone with notch */
    /* Learn more about this technique here: https://kulturbanause.de/blog/websites-fuer-das-iphone-x-optimieren-weisse-balken-entfernen-viewport-anpassen-safe-area-festlegen/ */
    padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
    padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
    padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
    padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
    @media (min-width: 680px) {
      grid-template-columns: 1fr 1fr;      
    }
    /* gap: var(--s-10); */
  }
  .story-block img {
    width: 100%;
    height: auto;
  }
  /* Don't crop SVGs */
  .story-block img[src*=".svg"] {
    object-fit: contain;
    object-position: center;
  }

  .non-text-content {
    /* for now ignore clicks on the image, until we have non-text selections */
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 340px;
    @media (max-width: 680px) {
      min-width: 100%;
    }
  }

  /* Layout styles */
  .story-block.layout-2, .story-block.layout-1 {
    align-items: center;
  }

  @container (min-width: 680px) {
    /* on mobile display image on top of text */
    .story-block.layout-2 > div:first-child {
      order: 2;
    }
    .story-block.layout-2 > div:last-child {
      order: 1;
    }
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
