import { Node, TextProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import './text_node.css';

export default function Heading1(props: NodeComponentProps) {
	return (
		<Node path={props.path}>
			<div class="text max-w-screen-lg mx-auto w-full">
				<TextProperty
					tag="h1"
					class="heading1"
					path={[...props.path, 'content']}
					placeholder="Heading 1"
				/>
			</div>
		</Node>
	);
}
