import { createMemo } from 'solid-js';
import type { MarkComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';
import './Code.css';

export default function Code(props: MarkComponentProps) {
	const svedit = use_app_svedit();
	const node = createMemo<Nodes['code']>(() => svedit.session.get(props.path));
	return (
		<code id={node().id} data-node-id={node().id} class="mark-code">
			{props.content}
		</code>
	);
}
