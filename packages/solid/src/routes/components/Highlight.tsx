import { createMemo } from 'solid-js';
import { serialize_path } from '@svedit/solid';
import type { MarkComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';
import './Highlight.css';

export default function Highlight(props: MarkComponentProps) {
	const svedit = use_app_svedit();
	const node = createMemo<Nodes['highlight']>(() => svedit.session.get(props.path));
	return (
		<mark
			id={node().id}
			data-node-id={node().id}
			class="mark-highlight"
			style={`anchor-name: --${serialize_path(props.path)};`}
		>
			{props.content}
		</mark>
	);
}
