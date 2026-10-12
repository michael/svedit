import { TextProperty, CustomProperty, NodeArrayProperty, Node, useNode } from '@svedit/react';
import type { NodeComponentProps } from '@svedit/react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './Story.css';

// Static assets live under the app's base URL (/react/ or /vue/ in the
// assembled site, / in a standalone build).
const base = import.meta.env.BASE_URL;

// ATTENTION: Keep the caption's children free of stray text nodes, whitespace would mess up contenteditable
export default function Story({ path }: NodeComponentProps) {
	const node = useNode<Nodes['story']>(path);
	const has_buttons = node.buttons.nodes.length > 0;

	return (
		<Node path={path}>
			<div className={`story layout-${node.layout} max-w-screen-lg mx-auto w-full`}>
				<CustomProperty className="image-wrapper" path={[...path, 'image']}>
					<div style={{ width: '100%', height: '100%' }} contentEditable={false}>
						<img
							src={node.image || `${base}icons/image-placeholder.svg`}
							alt={node.title.content}
							className={node.image ? undefined : 'placeholder'}
						/>
					</div>
				</CustomProperty>
				<div className="caption">
					<TextProperty
						className="heading2"
						path={[...path, 'title']}
						placeholder="The CTA headline should be clear and benefit-driven."
					/>
					<TextProperty
						className="body"
						path={[...path, 'description']}
						placeholder="It should be supported by a short sentence or two to clarify the offer or value, especially if the headline is bold or emotional."
					/>
					<NodeArrayProperty
						className={`buttons${!has_buttons ? ' empty' : ''}`}
						path={[...path, 'buttons']}
					/>
				</div>
			</div>
		</Node>
	);
}
