<script>
  import CursorTrap from './CursorTrap.svelte';
  let {
    path,
    children
  } = $props();
</script>

<!-- data-index={path.at(-1)} -->
<div
  class="block"
  style="anchor-name: --{path.join('-')};"
>
  {@render children()}
  <CursorTrap {path} type="after-node-cursor-trap" />
</div>

<style>
  .block {
    position: relative;
  }
</style>
