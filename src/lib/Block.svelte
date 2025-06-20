<script>
  import CursorTrap from './CursorTrap.svelte';
  let {
    path,
    children
  } = $props();
</script>

<div
  class="block"
  data-path={path.join('.')}
  data-type="block"
  data-index={path.at(-1)}
  style="anchor-name: --{path.join('-')};"
>
  {@render children()}
  <CursorTrap {path} position="after" />
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