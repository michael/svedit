import { use_svedit } from './context.js';
import Node from './Node.js';
import type { DocumentPath } from './types.js';

/** Fallback for node types without a registered component. */
export default function UnknownNode(props: { path: DocumentPath }) {
	const svedit = use_svedit();
	return <Node path={props.path}>Unknown: {svedit.session.get(props.path).type}.</Node>;
}
