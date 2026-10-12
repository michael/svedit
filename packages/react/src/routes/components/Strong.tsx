import { useNode } from '@svedit/react';
import type { MarkComponentProps } from '@svedit/react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

export default function Strong({ path, content }: MarkComponentProps) {
	const node = useNode<Nodes['strong']>(path);
	return (
		<strong id={node.id} data-node-id={node.id}>
			{content}
		</strong>
	);
}
