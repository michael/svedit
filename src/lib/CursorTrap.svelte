<script>
	import { getContext } from 'svelte';
	import { determine_node_array_orientation } from './util.js';

	const svedit = getContext('svedit');
	let {
	  node_array_path,
		type, // either 'position-zero-cursor-trap' or 'after-node-cursor-trap'
	} = $props();

	let node_array_orientation = $derived(
		determine_node_array_orientation(svedit.doc, node_array_path)
	);
</script>

<!-- Cursor trap that provides a contenteditable target for node_array cursor positioning -->
<div
	class="cursor-trap svedit-selectable"
	class:after-node-cursor-trap={type === 'after-node-cursor-trap'}
	class:position-zero-cursor-trap={type === 'position-zero-cursor-trap'}
	data-type={type}
	class:horizontal={node_array_orientation === 'horizontal'}
	class:vertical={node_array_orientation === 'vertical'}
><br></div>

<style>
	.cursor-trap {
    outline: 1px dashed var(--stroke-color);
		position: relative;
		/* outline: none; */
		cursor: pointer;
		z-index: 20;
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
		outline: 1px dashed var(--editing-stroke-color);
	}
</style>
