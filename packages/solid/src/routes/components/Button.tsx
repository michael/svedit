import { createMemo } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { Node, TextProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';
import './Button.css';

export default function Button(props: NodeComponentProps) {
	const svedit = use_app_svedit();
	const node = createMemo<Nodes['button']>(() => svedit.session.get(props.path));

	return (
		<Node path={props.path}>
			<Dynamic
				component={svedit.editable ? 'div' : 'a'}
				href={svedit.editable ? undefined : node().href}
				class="button"
			>
				<TextProperty class="body" path={[...props.path, 'content']} placeholder="Call to Action" />
			</Dynamic>
		</Node>
	);
}
