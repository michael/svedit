import Story from '../../routes/components/Story.js';
import type { NodeComponentProps } from '../../lib/types.js';

/**
 * Stand-in for the fresh component reference that Vite/Solid HMR
 * produces when a node component file is saved in dev mode. Swapping
 * `session.config.node_components.story` to this wrapper makes Solid
 * dispose the old story subtree and create a new one — recreating all
 * node and node-gap DOM elements — without any document change.
 *
 * All props (path, mark, annotations) are forwarded to Story.
 */
export default function StoryHmrProxy(props: NodeComponentProps) {
	return <Story {...props} />;
}
