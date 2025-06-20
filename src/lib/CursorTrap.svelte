<script>
  import { getContext } from 'svelte';
  
  const svedit = getContext('svedit');

  let {
    path,
    type,
    // position, // 'after' | 'zero'
  } = $props();
</script>

<!-- Cursor trap that provides a contenteditable target for container cursor positioning -->
<div 
  class="cursor-trap {type}"
  data-type={type}
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
    background: var(--secondary-fill-color);
  }
</style>