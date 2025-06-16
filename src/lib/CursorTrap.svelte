<script>
  import { getContext } from 'svelte';
  
  const svedit = getContext('svedit');

  let {
    path,
    position, // 'after' | 'zero'
    class: css_class = '',
  } = $props();
</script>

<!-- Cursor trap that provides a contenteditable target for container cursor positioning -->
<div 
  class="cursor-trap {css_class} cursor-trap-{position}" 
  data-type="cursor-trap"
><div class="cursor-trap-content"></div></div>

<style>
  .cursor-trap {
    height: 1px;
    position: relative;
    outline: none;
  }

  .cursor-trap-content {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    background: #eee;
  }
</style>