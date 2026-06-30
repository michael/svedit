<script>
	let { node_array_annotation = null } = $props();
</script>

<div
	data-annotation-id={node_array_annotation?.node.id}
	data-annotation-start={node_array_annotation?.is_start}
	data-annotation-middle={node_array_annotation?.is_middle}
	data-annotation-end={node_array_annotation?.is_end}
></div>
