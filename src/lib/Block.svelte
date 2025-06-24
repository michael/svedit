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
  style="anchor-name: --{path.join('-')};"
>
  {@render children()}
  <CursorTrap {path} type="after-node-cursor-trap" />
</div>

<style>
  div {
    position: relative;
  }
</style>
