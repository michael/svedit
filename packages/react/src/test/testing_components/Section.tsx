import type { MarkComponentProps } from '../../lib/types.js';

export default function Section({ content, children }: MarkComponentProps) {
	return <section>{children ?? content}</section>;
}
