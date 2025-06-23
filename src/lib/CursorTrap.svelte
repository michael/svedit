<script>
	let { path, type } = $props();
</script>

<!-- Cursor trap that provides a contenteditable target for container cursor positioning -->
<div class="cursor-trap {type}" data-type={type}><div class="cursor-trap-content"></div></div>

<style>
	.cursor-trap {
		/* height: 1px; */
		position: relative;
		outline: none;
		cursor: pointer;
	}

	.cursor-trap:hover {
		border: 1px dashed var(--editing-stroke-color);
	}

	.cursor-trap-content {
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		right: 0;
	}

	/* .list :global {
    .list-container > .block > .cursor-trap {
      position: absolute;
      bottom: -6px;
      left: 0;
      right: 0;
      height: 12px;
      z-index: 1000;
    }
  } */
</style>
