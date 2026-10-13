import { Node, NodeArrayProperty } from '@svedit/react';
import type { NodeComponentProps } from '@svedit/react';
import './List.css';

export default function List({ path }: NodeComponentProps) {
	return (
		<Node path={path}>
			<div className="list max-w-screen-md mx-auto">
				<NodeArrayProperty className="list-node-array" path={[...path, 'list_items']} />
			</div>
		</Node>
	);
}
