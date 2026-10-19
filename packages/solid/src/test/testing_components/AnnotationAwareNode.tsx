import type { NodeComponentProps } from '../../lib/types.js';

export default function AnnotationAwareNode(props: NodeComponentProps) {
	const annotations = () => props.annotations ?? [];
	return (
		<div
			data-mark-id={props.mark?.node.id ?? ''}
			data-mark-index={props.mark?.index ?? ''}
			data-mark-start-offset={props.mark?.start_offset ?? ''}
			data-mark-end-offset={props.mark?.end_offset ?? ''}
			data-mark-start={props.mark ? String(props.mark.is_start) : ''}
			data-mark-middle={props.mark ? String(props.mark.is_middle) : ''}
			data-mark-end={props.mark ? String(props.mark.is_end) : ''}
			data-annotations-count={annotations().length}
			data-annotations-ids={annotations()
				.map((annotation) => annotation.node.id)
				.join(',')}
		/>
	);
}
