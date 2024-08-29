<script>
  import { getContext } from 'svelte';
  const surface = getContext('surface');

  let {
    path,
    block
  } = $props();

  function is_selected() {
    return false;
  }

</script>

<div data-path={path.join('.')} data-type="block" class:selected={is_selected()}>
  Unknown block type {block.type}
</div>

<style>
  .selected {
    outline: 1px solid #0075d5;
  }
</style>