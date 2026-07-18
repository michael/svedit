/**
 * Shared helpers for the op-engine test suites (commit funnel, splice ops,
 * ingest, history). They operate on the fixture document from
 * create_test_session.js.
 */

import create_test_session from './create_test_session.js';
import type { DocumentPath, Text } from '../lib/types.js';

type TestSession = ReturnType<typeof create_test_session>;

export const title_path: DocumentPath = ['story_1', 'title'];

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

export function set_caret(session: TestSession, offset: number): void {
	session.selection = {
		type: 'text',
		path: title_path,
		anchor_offset: offset,
		focus_offset: offset
	};
}

// Emulates a keystroke: the transaction picks up the current session
// selection, which apply() advances after each insert.
export function press_key(session: TestSession, char: string): void {
	const tr = session.tr;
	tr.insert_text(char);
	session.apply(tr, { batch: true });
}

export function current_entry(session: TestSession) {
	return session.history[session.history_index];
}

// The test session shares module-level schema objects; clone so per-test
// type additions don't leak into other tests.
export function create_annotated_session(): TestSession {
	const session = create_test_session();
	session.schema = structuredClone(session.schema);
	session.schema.strong = { kind: 'mark', properties: {} };
	session.schema.comment = { kind: 'annotation', properties: {} };
	(session.schema.story.properties.title as any).mark_types = ['strong'];
	(session.schema.story.properties.title as any).annotation_types = ['comment'];
	return session;
}

export function annotate(session: TestSession, anchor_offset: number, focus_offset: number) {
	session.selection = { type: 'text', path: title_path, anchor_offset, focus_offset };
	session.apply(session.tr.toggle_annotation('comment', {}));
	const { annotations } = session.get<Text>(title_path);
	return annotations[annotations.length - 1];
}
