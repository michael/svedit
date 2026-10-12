import type { NodeComponentProps } from '../../lib/types.js';

export default function AnnotationAwareNode({ mark = null, annotations = [] }: NodeComponentProps) {
	return (
		<div
			data-mark-id={mark?.node.id ?? ''}
			data-mark-index={mark?.index ?? ''}
			data-mark-start-offset={mark?.start_offset ?? ''}
			data-mark-end-offset={mark?.end_offset ?? ''}
			data-mark-start={mark ? String(mark.is_start) : ''}
			data-mark-middle={mark ? String(mark.is_middle) : ''}
			data-mark-end={mark ? String(mark.is_end) : ''}
			data-annotations-count={annotations.length}
			data-annotations-ids={annotations.map((annotation) => annotation.node.id).join(',')}
		></div>
	);
}
