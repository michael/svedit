<script>
	let { mark = null, annotations = [] } = $props();
</script>

<div
	data-mark-id={mark?.node.id ?? ''}
	data-mark-index={mark?.index ?? ''}
	data-mark-start-offset={mark?.start_offset ?? ''}
	data-mark-end-offset={mark?.end_offset ?? ''}
	data-mark-start={mark?.is_start ?? ''}
	data-mark-middle={mark?.is_middle ?? ''}
	data-mark-end={mark?.is_end ?? ''}
	data-annotations-count={annotations.length}
	data-annotations-ids={annotations.map((annotation) => annotation.node.id).join(',')}
></div>
