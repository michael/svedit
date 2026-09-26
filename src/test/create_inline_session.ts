import create_test_session from './create_test_session.js';
import InlineChip from './testing_components/InlineChip.svelte';

/**
 * A session whose story description accepts a `strong` mark and a `mention`
 * inline node. The shared schema and config objects are cloned so per-test
 * mutations cannot leak into other suites.
 */
export default function create_inline_session() {
	const session = create_test_session();
	session.schema = structuredClone(session.schema);
	session.config = {
		...session.config,
		node_components: { ...session.config.node_components }
	};
	session.schema.strong = { kind: 'mark', properties: {} };
	session.schema.mention = { kind: 'inline', properties: { user_id: { type: 'string' } } };
	(session.schema.story.properties.description as any).mark_types = ['strong'];
	(session.schema.story.properties.description as any).inline_types = ['mention'];
	session.config.node_components.mention = InlineChip;
	return session;
}
