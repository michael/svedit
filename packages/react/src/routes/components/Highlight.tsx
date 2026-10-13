import { serialize_path, useNode } from '@svedit/react';
import type { MarkComponentProps } from '@svedit/react';
import type { CSSProperties } from 'react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './Highlight.css';

export default function Highlight({ path, content }: MarkComponentProps) {
	const node = useNode<Nodes['highlight']>(path);
	return (
		<mark
			id={node.id}
			data-node-id={node.id}
			className="mark-highlight"
			style={{ anchorName: `--${serialize_path(path)}` } as CSSProperties}
		>
			{content}
		</mark>
	);
}
