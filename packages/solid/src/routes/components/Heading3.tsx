import { Node, TextProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import './text_node.css';

export default function Heading3(props: NodeComponentProps) {
	return (
		<Node path={props.path}>
			<div class="text max-w-screen-lg mx-auto w-full">
				<TextProperty
					tag="h3"
					class="heading3"
					path={[...props.path, 'content']}
					placeholder="Heading 3"
				/>
			</div>
		</Node>
	);
}
