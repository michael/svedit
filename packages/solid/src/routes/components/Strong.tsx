import { createMemo } from 'solid-js';
import type { MarkComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';

export default function Strong(props: MarkComponentProps) {
	const svedit = use_app_svedit();
	const node = createMemo<Nodes['strong']>(() => svedit.session.get(props.path));
	return (
		<strong id={node().id} data-node-id={node().id}>
			{props.content}
		</strong>
	);
}
