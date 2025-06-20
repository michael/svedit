<script>
  import { getContext } from 'svelte';
  const svedit = getContext('svedit');

  let {
    path, 
    class: css_class,
    children,
  } = $props();
</script>

<!-- NOTE: It's super crucial that there is no extra whitespace, to not introduce additional cursor positions in contenteditable -->
<div
  class="property {css_class}"
  data-type="property"
  data-path={path.join('.')}
  style="anchor-name: --{path.join('-')};"
><!--
  --><div class="cursor-trap"></div><!--
  --><div class="property-content" contenteditable="false">{@render children()}</div><!--
--></div>

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
  .property-content {
    width: 100%;
    height: 100%;
  }
</style>