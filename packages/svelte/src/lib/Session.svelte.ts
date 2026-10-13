import { Session as CoreSession } from '@svedit/core';
import type { Document, DocumentSchema, Selection, SessionConfig } from '@svedit/core';
import { create_tracker } from './reactivity.svelte.js';

/**
 * The @svedit/core Session with Svelte reactivity: reading `session.doc`,
 * `session.selection`, `session.can_undo` etc. inside a `$derived`, `$effect`
 * or template subscribes to that field, and every `session.apply()` updates
 * exactly the readers of the fields it changed.
 */
export default class Session<S extends DocumentSchema = DocumentSchema> extends CoreSession<S> {
	/**
	 * @param schema - The document schema
	 * @param doc - The document
	 * @param config - configuration object
	 * @param options - Optional settings (e.g. initial selection state)
	 */
	constructor(
		schema: S,
		doc: Document,
		config: SessionConfig,
		options: { selection?: Selection | null } = {}
	) {
		super(schema, doc, config, { ...options, tracker: create_tracker() });
	}
}
