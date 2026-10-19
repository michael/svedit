import { createMemo } from 'solid-js';
import type { MarkComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';
import './Section.css';

/**
 * Mark component used for both text marks (`content` prop) and node-array
 * marks (child nodes as `children`). The children are the section's only
 * child expression, so they are inserted directly, without placeholder
 * text nodes between the wrapped node gaps and nodes.
 */
export default function Section(props: MarkComponentProps) {
	const svedit = use_app_svedit();
	const node = createMemo<Nodes['section']>(() => svedit.session.get(props.path));
	return (
		<section id={node().id} class="section" data-node-id={node().id}>
			{props.children ?? props.content}
		</section>
	);
}
