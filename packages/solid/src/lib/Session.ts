import { Session as CoreSession } from '@svedit/core';
import type { Document, DocumentSchema, Selection, SessionConfig } from '@svedit/core';
import { create_tracker } from './reactivity.js';

/**
 * The @svedit/core Session with Solid reactivity: reading `session.doc`,
 * `session.selection`, `session.can_undo` etc. inside a memo, effect or JSX
 * expression subscribes to that field, and every `session.apply()` updates
 * exactly the readers of the fields it changed.
 *
 * Session state is plain objects. Do not hand it values from a Solid
 * `createStore` (unwrap them with `unwrap()` first): a store proxy would
 * break reference comparisons and structuredClone.
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
