import { markRaw, toRaw } from 'vue';
import { Session as CoreSession, Transaction } from '@svedit/core';
import type {
	Document,
	DocumentNode,
	DocumentPath,
	DocumentSchema,
	Selection,
	SessionConfig
} from '@svedit/core';
import { create_tracker } from './reactivity.js';

/**
 * A Transaction that unwraps Vue reactive proxies at its boundaries, so
 * callers can pass `reactive()` objects without hitting structuredClone's
 * proxy limits.
 */
class VueTransaction extends Transaction {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	set(path: DocumentPath, value: any): this {
		return super.set(path, toRaw(value));
	}

	create(node: DocumentNode): this {
		return super.create(toRaw(node));
	}
}

/**
 * The @svedit/core Session with Vue reactivity: reading `session.doc`,
 * `session.selection`, `session.can_undo` etc. inside a computed, watcher or
 * template subscribes to that field, and every `session.apply()` updates
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
		// The session carries its own reactivity. Mark the instance raw so Vue
		// never wraps it in a reactive proxy (e.g. when it is stored in a ref()
		// or passed through reactive props), which would break access to the
		// core's private fields.
		markRaw(this);
	}

	get selection(): Selection | null {
		return super.selection;
	}

	/**
	 * Stores the selection by reference, after unwrapping a Vue proxy:
	 * `toRaw` returns plain objects unchanged, so identity is preserved, and a
	 * `reactive()` selection never becomes session state.
	 */
	set selection(value: Selection | null) {
		super.selection = toRaw(value);
	}

	/**
	 * Creates a new transaction for making atomic changes to the document.
	 */
	get tr(): Transaction {
		return new VueTransaction(this.schema, this.doc, this.selection, this.config);
	}
}
