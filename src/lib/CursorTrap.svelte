<script>
	import { getContext } from 'svelte';
	import { determine_container_orientation } from './util.js';

	const svedit = getContext('svedit');
	let {
	  container_path,
		type, // either 'position-zero-cursor-trap' or 'after-node-cursor-trap'
	} = $props();

	let container_orientation = $derived(
		determine_container_orientation(svedit.doc, container_path)
	);
</script>

<!-- Cursor trap that provides a contenteditable target for container cursor positioning -->
<div
	class="cursor-trap svedit-selectable"
	class:after-node-cursor-trap={type === 'after-node-cursor-trap'}
	class:position-zero-cursor-trap={type === 'position-zero-cursor-trap'}
	data-type={type}
	class:horizontal={container_orientation === 'horizontal'}
	class:vertical={container_orientation === 'vertical'}
><br></div>

<style>
	.cursor-trap {
		position: relative;
		outline: none;
		cursor: pointer;
	}

	.cursor-trap.vertical {
		position: absolute;
		bottom: -6px;
		left: 0;
		right: 0;
		height: 12px;
	}

	.cursor-trap.vertical.position-zero-cursor-trap {
  	bottom: auto;
    top: -6px;
	}

	.cursor-trap.horizontal {
		position: absolute;
		right: -6px;
		top: 0;
		bottom: 0;
		width: 12px;
	}

	.cursor-trap.horizontal.position-zero-cursor-trap {
		right: auto;
		left: -6px;
	}

	.cursor-trap:hover {
		border: 1px dashed var(--editing-stroke-color);
	}
</style>
