import { useNode } from '@svedit/react';
import type { MarkComponentProps } from '@svedit/react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './Section.css';

/**
 * Mark component used for both text marks (`content` prop) and node-array
 * marks (child nodes as `children`).
 */
export default function Section({ path, content, children }: MarkComponentProps) {
	const node = useNode<Nodes['section']>(path);
	return (
		<section id={node.id} className="section" data-node-id={node.id}>
			{children ?? content}
		</section>
	);
}
