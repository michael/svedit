import { createMemo } from 'solid-js';
import { Node, TextProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';
import './ListItem.css';

export default function ListItem(props: NodeComponentProps) {
	const svedit = use_app_svedit();
	// We expect the list_node to be the parent in the path
	const list_node = createMemo<Nodes['list']>(() => svedit.session.get(props.path.slice(0, -2)));
	const list_style = createMemo(() => list_node()?.layout ?? 'square');

	return (
		<Node path={props.path}>
			<div class="list-item" style={`--list-style: ${list_style()};`}>
				<TextProperty path={[...props.path, 'content']} placeholder="List item" />
			</div>
		</Node>
	);
}
