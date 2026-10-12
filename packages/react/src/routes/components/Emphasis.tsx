import { useNode } from '@svedit/react';
import type { MarkComponentProps } from '@svedit/react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

export default function Emphasis({ path, content }: MarkComponentProps) {
	const node = useNode<Nodes['emphasis']>(path);
	return (
		<em id={node.id} data-node-id={node.id}>
			{content}
		</em>
	);
}
