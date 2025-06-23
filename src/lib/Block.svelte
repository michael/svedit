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
  style="anchor-name: --{path.join('-')}; position: relative;"
>
  {@render children()}
  <CursorTrap {path} type="after-node-cursor-trap" />
</div>
