import { useNode } from '@svedit/react';
import type { MarkComponentProps } from '@svedit/react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './Code.css';

export default function Code({ path, content }: MarkComponentProps) {
	const node = useNode<Nodes['code']>(path);
	return (
		<code id={node.id} data-node-id={node.id} className="mark-code">
			{content}
		</code>
	);
}
