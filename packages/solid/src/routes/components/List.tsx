import { Node, NodeArrayProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import './List.css';

export default function List(props: NodeComponentProps) {
	return (
		<Node path={props.path}>
			<div class="list max-w-screen-md mx-auto">
				<NodeArrayProperty class="list-node-array" path={[...props.path, 'list_items']} />
			</div>
		</Node>
	);
}
