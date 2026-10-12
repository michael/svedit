import { Node, TextProperty, useNode, useSvedit } from '@svedit/react';
import type { NodeComponentProps } from '@svedit/react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './Button.css';

export default function Button({ path }: NodeComponentProps) {
	const node = useNode<Nodes['button']>(path);
	const editable = useSvedit((context) => context.editable);
	const Tag = editable ? 'div' : 'a';

	return (
		<Node path={path}>
			<Tag href={editable ? undefined : node.href} className="button">
				<TextProperty className="body" path={[...path, 'content']} placeholder="Call to Action" />
			</Tag>
		</Node>
	);
}
