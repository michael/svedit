import { serialize_path, useNode, useSvedit } from '@svedit/react';
import type { MarkComponentProps } from '@svedit/react';
import type { CSSProperties, MouseEvent } from 'react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './Link.css';

export default function Link({ path, content }: MarkComponentProps) {
	const node = useNode<Nodes['link']>(path);
	const editable = useSvedit((context) => context.editable);

	function handle_click(event: MouseEvent<HTMLAnchorElement>) {
		// While editing, a plain click places the caret (opening the link
		// popover); meta/ctrl click opens the link in a new tab, like in
		// Google Docs, Word or VS Code. Read mode navigates natively.
		if (editable && (event.metaKey || event.ctrlKey) && node?.href) {
			event.preventDefault();
			window.open(node.href, '_blank', 'noopener');
		}
	}

	return (
		<a
			id={node.id}
			data-node-id={node.id}
			className="mark-link"
			href={node?.href}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			target={(node as any)?.target || '_self'}
			title={editable && node?.href !== '' ? '⌘-click to open' : undefined}
			style={{ anchorName: `--${serialize_path(path)}` } as CSSProperties}
			onClick={handle_click}
		>
			{content}
		</a>
	);
}
