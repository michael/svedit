import type { MarkComponentProps } from '../../lib/types.js';

export default function Section(props: MarkComponentProps) {
	return <section>{props.children ?? props.content}</section>;
}
