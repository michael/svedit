import { Node, TextProperty, useNode } from '@svedit/react';
import type { NodeComponentProps } from '@svedit/react';
import type { CSSProperties } from 'react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './ListItem.css';

export default function ListItem({ path }: NodeComponentProps) {
	// We expect the list_node to be the parent in the path
	const list_node = useNode<Nodes['list']>(path.slice(0, -2));
	const list_style = list_node?.layout ?? 'square';

	return (
		<Node path={path}>
			<div className="list-item" style={{ '--list-style': list_style } as CSSProperties}>
				<TextProperty path={[...path, 'content']} placeholder="List item" />
			</div>
		</Node>
	);
}
