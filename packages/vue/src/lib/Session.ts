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
 * Unwraps Vue reactive proxies at every level of a plain value. `toRaw`
 * only unwraps the outermost proxy; a value assembled from a `reactive()`
 * object (`{ ...reactive_text, content: 'x' }`) carries proxies for its
 * nested arrays and objects, which `structuredClone` cannot clone. Arrays
 * and plain objects are copied only when something inside them changed, so
 * a value without proxies keeps its identity.
 */
function to_raw_deep<T>(value: T): T {
	const raw = toRaw(value);
	if (Array.isArray(raw)) {
		let copy: unknown[] | null = null;
		for (let index = 0; index < raw.length; index++) {
			const item = to_raw_deep(raw[index]);
			if (item !== raw[index]) {
				copy ??= raw.slice();
				copy[index] = item;
			}
		}
		return (copy ?? raw) as T;
	}
	if (raw !== null && typeof raw === 'object' && Object.getPrototypeOf(raw) === Object.prototype) {
		const record = raw as Record<string, unknown>;
		let copy: Record<string, unknown> | null = null;
		for (const key of Object.keys(record)) {
			const item = to_raw_deep(record[key]);
			if (item !== record[key]) {
				copy ??= { ...record };
				copy[key] = item;
			}
		}
		return (copy ?? raw) as T;
	}
	return raw;
}

/**
 * A Transaction that unwraps Vue reactive proxies at its boundaries, so
 * callers can pass `reactive()` objects (or values built from them) without
 * hitting structuredClone's proxy limits.
 */
class VueTransaction extends Transaction {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	set(path: DocumentPath, value: any): this {
		return super.set(path, to_raw_deep(value));
	}

	create(node: DocumentNode): this {
		return super.create(to_raw_deep(node));
	}

	set_selection(selection: Selection): this {
		return super.set_selection(to_raw_deep(selection));
	}
}

/**
 * The @svedit/core Session with Vue reactivity: reading `session.doc`,
 * `session.selection`, `session.can_undo` etc. inside a computed, watcher or
 * template subscribes to that field, and every `session.apply()` updates
 * exactly the readers of the fields it changed.
 *
 * Session state is always raw: the setters below unwrap a `reactive()` proxy
 * before storing it, so a proxy never becomes session state (where it would
 * break reference comparisons and structuredClone).
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

	get schema(): S {
		return super.schema;
	}

	set schema(value: S) {
		super.schema = toRaw(value);
	}

	get doc(): Document {
		return super.doc;
	}

	set doc(value: Document) {
		super.doc = toRaw(value);
	}

	get config(): SessionConfig {
		return super.config;
	}

	set config(value: SessionConfig) {
		super.config = toRaw(value);
	}

	get selection(): Selection | null {
		return super.selection;
	}

	/**
	 * Stores the selection by reference, after unwrapping Vue proxies:
	 * `to_raw_deep` returns plain objects unchanged, so identity is preserved,
	 * and a `reactive()` selection (or path) never becomes session state.
	 */
	set selection(value: Selection | null) {
		super.selection = to_raw_deep(value);
	}

	/**
	 * Creates a new transaction for making atomic changes to the document.
	 */
	get tr(): Transaction {
		return new VueTransaction(this.schema, this.doc, this.selection, this.config);
	}
}
