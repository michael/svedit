import { Node, TextProperty } from '@svedit/react';
import type { NodeComponentProps } from '@svedit/react';
import './text_node.css';

export default function Heading2({ path }: NodeComponentProps) {
	return (
		<Node path={path}>
			<div className="text max-w-screen-lg mx-auto w-full">
				<TextProperty
					tag="h2"
					className="heading2"
					path={[...path, 'content']}
					placeholder="Heading 2"
				/>
			</div>
		</Node>
	);
}
