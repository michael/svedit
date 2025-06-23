<script>
	import { getContext } from 'svelte';
	import { determine_container_orientation } from './util.js';

	const svedit = getContext('svedit');
	let { path, type } = $props();

	// Assuming that CursorTrap is called from inside a block.
	// There will be a second case where CursorTrap is called from the Container directly,
	// in this case we don't need to take off the last element.
	let container_orientation = $derived(
		determine_container_orientation(svedit.doc, path.slice(0, -1))
	);
</script>

<!-- Cursor trap that provides a contenteditable target for container cursor positioning -->
<div
	class="cursor-trap {type}"
	data-type={type}
	class:horizontal={container_orientation === 'horizontal'}
	class:vertical={container_orientation === 'vertical'}
>
	<div class="cursor-trap-content"></div>
</div>

<style>
	.cursor-trap {
		/* height: 1px; */
		position: relative;
		outline: none;
		cursor: pointer;
		z-index: 1000;
	}

	.cursor-trap.vertical {
		position: absolute;
		bottom: -6px;
		left: 0;
		right: 0;
		height: 12px;
	}

	.cursor-trap.horizontal {
		position: absolute;
		right: -6px;
		top: 0;
		bottom: 0;
		width: 12px;
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
</style>
