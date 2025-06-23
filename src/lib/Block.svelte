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
  data-path={path.join('.')}
  data-type="block"
  style="anchor-name: --{path.join('-')};"
>
  {@render children()}
  <CursorTrap {path} type="after-node-cursor-trap" />
</div>

<style>
  .block {
    position: relative;
  }

  /* .block > :global(.cursor-trap) {
    position: absolute;
    bottom: -6px;
    left: 0;
    right: 0;
    height: 12px;
    z-index: 1000;
  } */
</style>
