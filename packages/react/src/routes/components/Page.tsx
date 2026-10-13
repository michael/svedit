import { Node, NodeArrayProperty } from '@svedit/react';
import type { NodeComponentProps } from '@svedit/react';
import './Page.css';

export default function Page({ path }: NodeComponentProps) {
	return (
		<Node path={path}>
			<div className="page">
				<NodeArrayProperty className="body-node-array" path={[...path, 'body']} />
			</div>
		</Node>
	);
}
