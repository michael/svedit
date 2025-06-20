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

  :global(.block > .cursor-trap) {
    position: absolute;
    left: 0px;
    right: 0px;
    bottom: 0px;
    background: blue;
    height: 5px;
    /* z-index: 1;
    outline: none; */
  }
</style>