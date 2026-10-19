import { createMemo } from 'solid-js';
import type { MarkComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';

export default function Emphasis(props: MarkComponentProps) {
	const svedit = use_app_svedit();
	const node = createMemo<Nodes['emphasis']>(() => svedit.session.get(props.path));
	return (
		<em id={node().id} data-node-id={node().id}>
			{props.content}
		</em>
	);
}
