<script>
	let { annotation = null, annotations = [] } = $props();
</script>

<div
	data-annotation-id={annotation?.node.id ?? ''}
	data-annotation-index={annotation?.index ?? ''}
	data-annotation-start-offset={annotation?.start_offset ?? ''}
	data-annotation-end-offset={annotation?.end_offset ?? ''}
	data-annotation-start={annotation?.is_start ?? ''}
	data-annotation-middle={annotation?.is_middle ?? ''}
	data-annotation-end={annotation?.is_end ?? ''}
	data-annotations-count={annotations.length}
	data-annotations-ids={annotations.map((annotation) => annotation.node.id).join(',')}
></div>
