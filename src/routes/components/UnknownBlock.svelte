<script>
  let {
    path,
    block
  } = $props();
</script>

<div data-path={path.join('.')} data-type="block">
  Unknown block type {block.type}
</div>
