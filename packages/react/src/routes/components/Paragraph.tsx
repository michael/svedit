import { Node, TextProperty } from '@svedit/react';
import type { NodeComponentProps } from '@svedit/react';
import './text_node.css';

export default function Paragraph({ path }: NodeComponentProps) {
	return (
		<Node path={path}>
			<div className="text max-w-screen-lg mx-auto w-full">
				<TextProperty
					tag="p"
					className="body"
					path={[...path, 'content']}
					placeholder="Paragraph"
				/>
			</div>
		</Node>
	);
}
