<script>
  import { getContext } from 'svelte';
  const svedit = getContext('svedit');

  let {
    path, 
    class: css_class,
    children,
  } = $props();
</script>

<div
  class="property {css_class}"
  contenteditable="false"
  data-type="property"
  data-path={path.join('.')}
  style="anchor-name: --{path.join('-')};"
>
  <div class="cursor-trap" contenteditable="true" style=""></div>
  <!-- svelte-ignore a11y_img_redundant_alt -->
  {@render children()}
</div>

<style>
  .property {
    position: relative;
  }
  .cursor-trap {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    outline: none;
  }
</style>