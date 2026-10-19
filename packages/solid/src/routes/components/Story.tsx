import { createMemo } from 'solid-js';
import { TextProperty, CustomProperty, NodeArrayProperty, Node } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';
import './Story.css';

// Static assets live under the app's base URL (/solid/ in the assembled
// site, / in a standalone build).
const base = import.meta.env.BASE_URL;

// ATTENTION: Keep the caption's children free of stray text nodes, whitespace would mess up contenteditable
export default function Story(props: NodeComponentProps) {
	const svedit = use_app_svedit();
	const node = createMemo<Nodes['story']>(() => svedit.session.get(props.path));
	const has_buttons = createMemo(() => node().buttons.nodes.length > 0);

	return (
		<Node path={props.path}>
			<div class={`story layout-${node().layout} max-w-screen-lg mx-auto w-full`}>
				<CustomProperty class="image-wrapper" path={[...props.path, 'image']}>
					<div style={{ width: '100%', height: '100%' }} contenteditable="false">
						<img
							src={node().image || `${base}icons/image-placeholder.svg`}
							alt={node().title.content}
							classList={{ placeholder: !node().image }}
						/>
					</div>
				</CustomProperty>
				<div class="caption">
					<TextProperty
						class="heading2"
						path={[...props.path, 'title']}
						placeholder="The CTA headline should be clear and benefit-driven."
					/>
					<TextProperty
						class="body"
						path={[...props.path, 'description']}
						placeholder="It should be supported by a short sentence or two to clarify the offer or value, especially if the headline is bold or emotional."
					/>
					<NodeArrayProperty
						class={`buttons${!has_buttons() ? ' empty' : ''}`}
						path={[...props.path, 'buttons']}
					/>
				</div>
			</div>
		</Node>
	);
}
