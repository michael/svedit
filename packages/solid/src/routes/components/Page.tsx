import { Node, NodeArrayProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import './Page.css';

export default function Page(props: NodeComponentProps) {
	return (
		<Node path={props.path}>
			<div class="page">
				<NodeArrayProperty class="body-node-array" path={[...props.path, 'body']} />
			</div>
		</Node>
	);
}
