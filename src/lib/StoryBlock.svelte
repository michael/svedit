<script>
  import { getContext } from 'svelte';
  import Text from './Text.svelte';
  import Property from './Property.svelte';
  const svedit = getContext('svedit');

  let {
    path,
    index,
  } = $props();
  let block = $derived(svedit.doc.get(path));
</script>

<div
  class="story-block layout-{block.layout} max-w-screen-lg mx-auto w-full"
  data-path={path.join('.')}
  data-type="block"
  data-index={path.at(-1)}
  style="anchor-name: --{path.join('-')};"
>
  <Property class="image-wrapper" path={[...path,'image']}>
    <img
      src={block.image || '/icons/image-placeholder.svg'} 
      alt={block.title[0]}
      class:placeholder={!block.image}
    />
  </Property>
  <div class="caption">
    <!-- ATTENTION: Do not format the following lines, as whitespace will mess up contenteditable -->
    <Text class='heading2' path={[...path,'title']} editable={block.editable} />
    <Text class='body' path={[...path,'description']} editable={block.editable} />
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
      grid-template-columns: 1fr 2fr;
    }
    gap: var(--s-10);
    padding: var(--s-6);
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
  
  /* Placeholder styling */
  .story-block img.placeholder {
    opacity: 0.7;
    border: 2px dashed var(--stroke-color);
    border-radius: var(--s-2);
    padding: var(--s-4);
    background: var(--canvas-fill-color);
  }

  .story-block :global(.image-wrapper) {
    /* for now ignore clicks on the image, until we have non-text selections */
    /* pointer-events: none; */
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 280px;
    max-width: 320px;
    @media (max-width: 680px) {
      min-width: 100%;
      max-width: 100%;
    }
  }

  /* Layout styles */
  .story-block.layout-2, .story-block.layout-1 {
    align-items: center;
  }

  @media (min-width: 680px) {
    /* Layout 2: Image on the right - use grid areas */
    .story-block.layout-2 {
      grid-template-columns: 2fr 1fr;
      grid-template-areas: "content image";
    }
    .story-block.layout-2 > :first-child {
      grid-area: image;
    }
    .story-block.layout-2 > :last-child {
      grid-area: content;
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
