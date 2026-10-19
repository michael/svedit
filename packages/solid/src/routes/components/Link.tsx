import { createMemo } from 'solid-js';
import { serialize_path } from '@svedit/solid';
import type { MarkComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';
import './Link.css';

export default function Link(props: MarkComponentProps) {
	const svedit = use_app_svedit();
	const node = createMemo<Nodes['link']>(() => svedit.session.get(props.path));

	function handle_click(event: MouseEvent) {
		// While editing, a plain click places the caret (opening the link
		// popover); meta/ctrl click opens the link in a new tab, like in
		// Google Docs, Word or VS Code. Read mode navigates natively.
		if (svedit.editable && (event.metaKey || event.ctrlKey) && node()?.href) {
			event.preventDefault();
			window.open(node().href, '_blank', 'noopener');
		}
	}

	return (
		<a
			id={node().id}
			data-node-id={node().id}
			class="mark-link"
			href={node()?.href}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			target={(node() as any)?.target || '_self'}
			title={svedit.editable && node()?.href !== '' ? '⌘-click to open' : undefined}
			style={`anchor-name: --${serialize_path(props.path)};`}
			onClick={handle_click}
		>
			{props.content}
		</a>
	);
}
