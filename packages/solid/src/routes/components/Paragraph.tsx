import { Node, TextProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import './text_node.css';

export default function Paragraph(props: NodeComponentProps) {
	return (
		<Node path={props.path}>
			<div class="text max-w-screen-lg mx-auto w-full">
				<TextProperty
					tag="p"
					class="body"
					path={[...props.path, 'content']}
					placeholder="Paragraph"
				/>
			</div>
		</Node>
	);
}
