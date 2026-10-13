import Node from './Node.js';
import { useNode } from './hooks.js';
import type { DocumentPath } from './types.js';

/** Fallback for node types without a registered component. */
export default function UnknownNode({ path }: { path: DocumentPath }) {
	const node = useNode(path);
	return <Node path={path}>Unknown: {node.type}.</Node>;
}
