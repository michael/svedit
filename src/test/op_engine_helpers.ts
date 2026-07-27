/**
 * Shared helpers for the op-engine test suites (commit funnel, splice ops,
 * ingest, history). They operate on the fixture document from
 * create_test_session.js.
 */

import type create_test_session from './create_test_session.js';
import type { Text } from '../lib/types.js';

type TestSession = ReturnType<typeof create_test_session>;

export function text_value(content: string): Text {
	return { content, marks: [], annotations: [] };
}

export function set_button_content(
	session: TestSession,
	text: string,
	{ batch = false }: { batch?: boolean } = {}
): void {
	const tr = session.tr;
	tr.set(['button_1', 'content'], text_value(text));
	session.apply(tr, { batch });
}
