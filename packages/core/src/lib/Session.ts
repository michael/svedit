import Transaction from './Transaction.js';
import { Store, derived } from './reactive.js';
import { char_slice, traverse, traverse_ids } from './utils.js';
import {
	get as doc_get,
	property_type as doc_property_type,
	kind as doc_kind,
	inspect as doc_inspect,
	create_document_draft,
	apply_op_to_draft,
	count_references as doc_count_references,
	validate_document_schema,
	validate_document,
	validate_config_components,
	validate_node,
	is_id_valid,
	get_referencing_node_ids,
	get_selected_marks,
	get_selected_annotations,
	validate_selection
} from './doc_utils.js';
import type { SelectedAttachment } from './doc_utils.js';
import type { Listener, Tracker } from './reactive.js';
import type {
	NodeId,
	DocumentPath,
	Selection,
	Attachment,
	NodeKind,
	DocumentSchema,
	DocumentNode,
	Document,
	AnyNode,
	Text,
	NodeArray,
	CommandRegistry,
	Inspection,
	SessionConfig,
	EditorContext
} from './types.js';
import type { Keymap } from './KeyMapper.js';

const BATCH_WINDOW_MS = 1000; // 1 second

type HistoryEntry = {
	ops: Transaction['ops'];
	inverse_ops: Transaction['inverse_ops'];
	selection_before: Selection | null;
	selection_after: Selection | null;
};

/**
 * The session's state lives in plain fields: values are reassigned
 * (copy-on-write), never mutated in place, so `console.log(session.get(id))`
 * yields plain objects. Every reassignment notifies the session's store with
 * the name of the field that changed (assigning the current value again is a
 * no-op, as with `$state.raw`); every read tracks it. Framework bindings plug
 * into this through a `Tracker` (Svelte: `$state`, Vue: `shallowRef`) or by
 * subscribing to the store (React), so each framework gets the same
 * per-field granularity it had with `$state.raw`, `shallowRef` and
 * `useSyncExternalStore`. Derived values are memoized per dependency (they
 * recompute only when a field they read changed) and exposed through
 * getters, mirroring `$derived`.
 */
export default class Session<S extends DocumentSchema = DocumentSchema> {
	#store = new Store();

	#selection: Selection | null = null;

	#schema: S = undefined as unknown as S;

	#doc: Document = undefined as unknown as Document;

	#config: SessionConfig = {};

	#history: HistoryEntry[] = [];
	#history_index = -1;
	#last_batch_started: number | undefined = undefined; // Timestamp for debounced batching

	// Commands and keymap - initialized by the editor component when ready
	// NOTE: Assumes single editor instance per session
	#commands: CommandRegistry = {};
	#keymap: Keymap = {};

	// Derived helpers for UI state, memoized per change so they keep a stable
	// reference between changes (important for snapshot comparisons)
	#selected_node = derived<AnyNode<S> | null>(this.#store, () => this.get_selected_node());
	#available_mark_types = derived(this.#store, () => this.get_available_mark_types());
	#available_annotation_types = derived(this.#store, () => this.get_available_annotation_types());
	#selected_marks = derived(this.#store, () =>
		get_selected_marks(this.schema, this.doc, this.selection)
	);
	#active_mark = derived<SelectedAttachment | null>(this.#store, () =>
		this.selected_marks.length === 1 ? this.selected_marks[0] : null
	);
	#selected_annotations = derived(this.#store, () =>
		get_selected_annotations(this.schema, this.doc, this.selection)
	);
	#active_annotation = derived<SelectedAttachment | null>(this.#store, () =>
		this.selected_annotations.length === 1 ? this.selected_annotations[0] : null
	);

	/**
	 * @param schema - The document schema
	 * @param doc - The document
	 * @param config - configuration object
	 * @param options - Optional settings: the initial selection and the
	 *   framework reactivity tracker (installed by the binding's Session)
	 */
	constructor(
		schema: S,
		doc: Document,
		config: SessionConfig,
		options: { selection?: Selection | null; tracker?: Tracker } = {}
	) {
		this.#store.tracker = options.tracker;

		// Validate the schema first
		validate_document_schema(schema);

		this.schema = schema;
		this.doc = doc;
		this.config = config;
		validate_document(this.doc, this.schema);
		validate_config_components(this.schema, this.config);

		// Set selection after doc is initialized so validation can work properly
		this.selection = options.selection ?? null;
	}

	/**
	 * Subscribes to session changes. Framework components normally go
	 * through their binding's hooks or reactivity instead of calling this.
	 */
	subscribe = (listener: Listener): (() => void) => this.#store.subscribe(listener);

	/** Change counter, bumped on every state reassignment. */
	get version(): number {
		return this.#store.version;
	}

	/**
	 * The store holding the session's change notifications. Pass the session
	 * (or this store) to `derived()` to memoize values computed from session
	 * state; framework bindings subscribe through it.
	 */
	get store(): Store {
		return this.#store;
	}

	get schema(): S {
		this.#store.track('schema');
		return this.#schema;
	}

	set schema(value: S) {
		if (Object.is(this.#schema, value)) return;
		this.#schema = value;
		this.#store.notify('schema');
	}

	get doc(): Document {
		this.#store.track('doc');
		return this.#doc;
	}

	set doc(value: Document) {
		if (Object.is(this.#doc, value)) return;
		this.#doc = value;
		this.#store.notify('doc');
	}

	get config(): SessionConfig {
		this.#store.track('config');
		return this.#config;
	}

	set config(value: SessionConfig) {
		if (Object.is(this.#config, value)) return;
		this.#config = value;
		this.#store.notify('config');
	}

	get history(): HistoryEntry[] {
		this.#store.track('history');
		return this.#history;
	}

	set history(value: HistoryEntry[]) {
		if (Object.is(this.#history, value)) return;
		this.#history = value;
		this.#store.notify('history');
	}

	get history_index(): number {
		this.#store.track('history_index');
		return this.#history_index;
	}

	set history_index(value: number) {
		if (Object.is(this.#history_index, value)) return;
		this.#history_index = value;
		this.#store.notify('history_index');
	}

	get last_batch_started(): number | undefined {
		this.#store.track('last_batch_started');
		return this.#last_batch_started;
	}

	set last_batch_started(value: number | undefined) {
		if (Object.is(this.#last_batch_started, value)) return;
		this.#last_batch_started = value;
		this.#store.notify('last_batch_started');
	}

	get commands(): CommandRegistry {
		this.#store.track('commands');
		return this.#commands;
	}

	set commands(value: CommandRegistry) {
		if (Object.is(this.#commands, value)) return;
		this.#commands = value;
		this.#store.notify('commands');
	}

	get keymap(): Keymap {
		this.#store.track('keymap');
		return this.#keymap;
	}

	set keymap(value: Keymap) {
		if (Object.is(this.#keymap, value)) return;
		this.#keymap = value;
		this.#store.notify('keymap');
	}

	get can_undo(): boolean {
		return this.history_index >= 0;
	}

	get can_redo(): boolean {
		return this.history_index < this.history.length - 1;
	}

	get selected_node(): AnyNode<S> | null {
		return this.#selected_node();
	}

	get available_mark_types(): string[] {
		return this.#available_mark_types();
	}

	get available_annotation_types(): string[] {
		return this.#available_annotation_types();
	}

	get selected_marks(): SelectedAttachment[] {
		return this.#selected_marks();
	}

	get active_mark(): SelectedAttachment | null {
		return this.#active_mark();
	}

	get selected_annotations(): SelectedAttachment[] {
		return this.#selected_annotations();
	}

	get active_annotation(): SelectedAttachment | null {
		return this.#active_annotation();
	}

	/**
	 * Gets the current selection
	 */
	get selection(): Selection | null {
		this.#store.track('selection');
		return this.#selection;
	}

	/**
	 * Sets the selection with validation
	 * @throws {Error} Throws if the selection is invalid
	 */
	set selection(value: Selection | null) {
		this._validate_selection(value);
		// Selections are immutable values stored by reference, like the doc:
		// the reference changes only when a new selection is assigned, so
		// readers can compare selections by identity. Assigning the current
		// selection again changes nothing and wakes no one.
		if (Object.is(this.#selection, value)) return;
		this.#selection = value;
		this.#store.notify('selection');
	}

	/**
	 * Validates that a selection is within bounds and refers to valid paths.
	 *
	 * @throws {Error} Throws if the selection is invalid
	 */
	private _validate_selection(selection: Selection | null): void {
		validate_selection(selection, this);
	}

	/**
	 * Gets the document_id from the doc
	 */
	get document_id(): string {
		return this.doc.document_id;
	}

	/**
	 * Validates the parts of a transaction result that can be affected by the transaction.
	 *
	 * This is intentionally narrower than full document validation. It validates all
	 * created/modified nodes, plus nodes that still reference created, modified, or
	 * deleted nodes. That catches local node invariants and dangling references left
	 * behind by deletes without scanning every node on every apply.
	 *
	 * @throws {Error} Throws if the transaction result is invalid
	 */
	validate_transaction_result(transaction: Transaction): void {
		const doc = transaction.doc;
		const affected_node_ids: Set<NodeId> = new Set([
			...transaction.created_node_ids,
			...transaction.modified_node_ids
		]);

		// A full-document referrer scan is only needed when a reference held
		// by an UNTOUCHED node can have become invalid:
		// - deletions can leave dangling references behind
		// - a 'type' change can violate a referrer's node/mark/annotation type
		//   constraint
		// References to created nodes can only live in nodes that were
		// themselves created or modified in this transaction (the reference
		// did not exist before), and modifying a node's other properties
		// cannot invalidate its referrers — so those cases are already
		// covered by the affected set and need no scan.
		if (transaction.deleted_node_ids.length > 0 || transaction.changed_node_types) {
			const scan_targets = new Set([
				...transaction.created_node_ids,
				...transaction.modified_node_ids,
				...transaction.deleted_node_ids
			]);
			for (const node_id of get_referencing_node_ids(this.schema, doc, scan_targets)) {
				affected_node_ids.add(node_id);
			}
		}

		for (const node_id of affected_node_ids) {
			const node = doc.nodes[node_id];
			if (node) validate_node(node, this.schema, doc.nodes);
		}
	}

	generate_id(): string {
		const id = this.config?.generate_id ? this.config.generate_id() : `node_${crypto.randomUUID()}`;
		if (!is_id_valid(id)) {
			throw new Error(
				`Generated node id ${JSON.stringify(id)} is invalid. Node ids must be non-empty strings that start with a letter or underscore, contain only letters, numbers, underscores, or dashes, and must not contain "__".`
			);
		}
		return id;
	}

	/**
	 * Initialize commands and keymap for this session.
	 * Called by the editor component when it has the necessary context.
	 *
	 * NOTE: This assumes a single editor instance per session.
	 * For multiple editors on the same document, this architecture would need
	 * to be refactored to support multiple sessions per document.
	 *
	 * @param context - The editor context with session, editable, canvas, etc.
	 */
	initialize_commands(context: EditorContext<S>): void {
		if (this.config?.create_commands_and_keymap) {
			const { commands, keymap } = this.config.create_commands_and_keymap(context);
			this.#store.batch(() => {
				this.commands = commands;
				this.keymap = keymap;
			});
		}
	}

	get_available_mark_types(): string[] {
		if (this.selection?.type !== 'text' && this.selection?.type !== 'node') return [];
		const property_definition = this.inspect(this.selection.path);
		return property_definition.mark_types || [];
	}

	get_available_annotation_types(): string[] {
		if (this.selection?.type !== 'text' && this.selection?.type !== 'node') return [];
		const property_definition = this.inspect(this.selection.path);
		return property_definition.annotation_types || [];
	}

	// Helper function to get the currently selected node
	get_selected_node(): AnyNode<S> | null {
		if (!this.selection) return null;

		if (this.selection.type === 'node') {
			const start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
			const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
			// Only consider selection of a single node
			if (end - start !== 1) return null;
			const node_array: NodeArray = this.get(this.selection.path);
			const node_id = node_array.nodes[start];
			return node_id ? this.get(node_id) : null;
		} else {
			// we are assuming we are either in a text or property (=custom) selection
			const owner_node_path = this.selection?.path?.slice(0, -1);
			if (!owner_node_path) return null;
			const owner_node = this.get(owner_node_path);
			return owner_node;
		}
	}

	/**
	 * Creates a new transaction for making atomic changes to the document.
	 */
	get tr(): Transaction {
		// We create a copy of the current state to avoid modifying the original
		return new Transaction(this.schema, this.doc, this.selection, this.config);
	}

	/**
	 * Applies a transaction to the document.
	 * Auto-batches history entries with debounced behavior (max one entry per second) when batch is true.
	 *
	 * @param transaction - The transaction to apply
	 * @param options - Optional configuration (batch: whether to allow batching with previous transaction)
	 */
	apply(transaction: Transaction, { batch = false }: { batch?: boolean } = {}): this {
		this.validate_transaction_result(transaction);
		// Validate the selection against the transaction's document before any
		// state is swapped: the selection setter below would throw after the
		// doc was already replaced, leaving a new doc with the old selection and
		// no history entry to undo it.
		validate_selection(transaction.selection, transaction);
		// From here on the transaction's draft becomes session state.
		transaction.applied = true;
		// All field reassignments below wake subscribers once, after the
		// whole apply has settled.
		this.#store.batch(() => {
			// Only swap the doc when something changed. The transaction draft is
			// always a fresh object, and assigning it for an ops-less transaction
			// (e.g. selection-only) would needlessly invalidate every doc-dependent
			// snapshot in the component tree.
			if (transaction.ops.length > 0) {
				this.doc = transaction.doc;
			}
			// Stored by reference: a transaction that did not touch the selection
			// keeps the current selection object.
			this.selection = transaction.selection;
			// A transaction without ops (e.g. a no-op delete at the start of the
			// document) changed nothing undoable: recording it would add an undo
			// step that visibly does nothing.
			if (transaction.ops.length === 0) return;
			if (this.history_index < this.history.length - 1) {
				this.history = this.history.slice(0, this.history_index + 1);
			}

			const now = Date.now();
			const should_batch =
				batch &&
				this.history_index >= 0 &&
				this.last_batch_started !== undefined &&
				now - this.last_batch_started < BATCH_WINDOW_MS;

			if (should_batch) {
				// Merge into the existing history entry (within the batch window).
				// The merged entry gets fresh arrays: the entry's arrays belong to
				// the transaction that created it and must not change under it.
				const last_entry = this.history[this.history_index];
				const merged_entry: HistoryEntry = {
					...last_entry,
					ops: [...last_entry.ops, ...transaction.ops],
					inverse_ops: [...last_entry.inverse_ops, ...transaction.inverse_ops],
					selection_after: this.selection
				};
				this.history = this.history.map((entry, index) =>
					index === this.history_index ? merged_entry : entry
				);
			} else {
				// Create new history entry (batch window elapsed, first edit, or batch not requested)
				this.history = [
					...this.history,
					{
						ops: transaction.ops,
						inverse_ops: transaction.inverse_ops,
						selection_before: transaction.selection_before,
						selection_after: this.selection
					}
				];
				this.history_index = this.history_index + 1;
				// Only set last_batch_started if batching was requested
				if (batch) {
					this.last_batch_started = now;
				} else {
					this.last_batch_started = undefined;
				}
			}
		});

		return this;
	}

	undo(): this | undefined {
		if (this.history_index < 0) {
			return;
		}
		const change = this.history[this.history_index];
		// One draft for the whole change set — ops mutate the draft with
		// node-level copy-on-write instead of copying the nodes map per op.
		const doc = create_document_draft(this.doc);
		change.inverse_ops
			.slice()
			.reverse()
			.forEach((op) => {
				apply_op_to_draft(doc, op);
			});
		this.#store.batch(() => {
			this.doc = doc;
			this.selection = change.selection_before;
			this.history_index = this.history_index - 1;
			// History navigation ends any open typing batch, so the next batched
			// apply starts a fresh entry instead of appending to a stale one.
			this.last_batch_started = undefined;
		});
		return this;
	}

	redo(): this | undefined {
		if (this.history_index >= this.history.length - 1) {
			return;
		}
		const change = this.history[this.history_index + 1];
		const doc = create_document_draft(this.doc);
		change.ops.forEach((op) => {
			apply_op_to_draft(doc, op);
		});
		this.#store.batch(() => {
			this.history_index = this.history_index + 1;
			this.doc = doc;
			this.selection = change.selection_after;
			// Redo ends any open typing batch, matching undo().
			this.last_batch_started = undefined;
		});
		return this;
	}

	/**
	 * Gets a node instance or property value at the specified path.
	 *
	 * The result type defaults to `any` because a path can address a node or
	 * any property value. Annotate the target to type the result.
	 *
	 * @example
	 * // Get a node by ID
	 * session.get('list_1') // => { type: 'list', id: 'list_1', ... }
	 *
	 * @example
	 * // Get a node array property
	 * session.get(['list_1', 'list_items']) // => [ 'list_item_1', 'list_item_2' ]
	 *
	 * @example
	 * // Get a specific node from an array
	 * session.get(['page_1', 'body', 3, 'list_items', 0]) // => { type: 'list_item', id: 'list_item_1', ... }
	 *
	 * @example
	 * // Get a text property
	 * session.get(['page_1', 'cover', 'title']) // => {content: 'Hello world', marks: [], annotations: []}
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	get<T = any>(path: DocumentPath | string): T {
		return doc_get(this.schema, this.doc, path);
	}

	/**
	 * While .get gives you the value of a path, inspect gives you
	 * the type info of that value.
	 *
	 * @todo The layout of these should be improved and more explictly typed
	 *
	 * @example
	 * session.inspect(['page_1', 'body']) => {
	 *   kind: 'property',
	 *   name: 'body',
	 *   type: 'node_array',
	 *   node_types: ['text', 'story', 'list'],
	 *   default_node_type: 'text'
	 * }
	 *
	 * @example
	 * session.inspect(['page_1', 'body', 1]) => {
	 *   kind: 'node',
	 *   id: 'paragraph_234',
	 *   type: 'paragraph',
	 *   properties: {...}
	 * }
	 */
	inspect(path: DocumentPath): Inspection {
		return doc_inspect(this.schema, this.doc, path);
	}

	/**
	 * Determines the kind of a node ('document' for root nodes, 'block' for
	 * structured blocks, 'text' for pure text nodes, 'mark' for mark nodes or
	 * 'annotation' for annotation nodes).
	 */
	kind(node: DocumentNode): NodeKind {
		return doc_kind(this.schema, node);
	}

	/**
	 * Determines whether a node type can be inserted at a given selection.
	 *
	 * @param node_type - The type of node to insert.
	 * @param selection - The selection at which to insert the node.
	 * @returns True if the node type can be inserted, false otherwise.
	 */
	can_insert(node_type: string, selection: Selection | null = this.selection): boolean {
		if (selection?.type === 'node') {
			const property_definition = this.inspect(selection.path);
			if (property_definition.node_types.includes(node_type)) {
				return true;
			}
		}

		// No insert position found yet, and root not reached, try one level up if possible
		const next_node_insert_caret = this.get_next_node_insert_caret(selection);
		if (!next_node_insert_caret) return false;
		return this.can_insert(node_type, next_node_insert_caret);
	}

	/**
	 * Compute next possible insert position from a given selection
	 *
	 * @param selection - Reference selection
	 * @returns The next node insert caret selection, or null if none is available
	 */
	get_next_node_insert_caret(selection: Selection | null = this.selection): Selection | null {
		if (!selection) return null;

		// Array indexes identify insertion positions. Single-node references can
		// occur between arrays, so removing a fixed pair of segments is unsafe.
		for (let index = selection.path.length - 1; index >= 1; index--) {
			const node_index = selection.path[index];
			if (typeof node_index !== 'number') continue;
			const parent_path = selection.path.slice(0, index);
			if (this.inspect(parent_path).type !== 'node_array') continue;
			return {
				type: 'node',
				path: parent_path,
				anchor_offset: node_index + 1,
				focus_offset: node_index + 1
			};
		}
		return null;
	}

	get_selected_text(): (Text & { nodes: Record<string, DocumentNode> }) | null {
		if (this.selection?.type !== 'text') return null;

		const selection_start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
		const selection_end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
		const text_value: Text = this.get(this.selection.path);
		const selected_text = char_slice(text_value.content, selection_start, selection_end);
		const nodes: Record<string, DocumentNode> = {};

		const clip_ranges = (ranges: Attachment[]) =>
			ranges
				.map((range) => {
					if (selection_start < range.end_offset && selection_end > range.start_offset) {
						const sub_graph = this.traverse(range.node_id);
						for (const node of sub_graph) {
							if (!nodes[node.id]) {
								nodes[node.id] = node;
							}
						}
						return {
							start_offset: Math.max(range.start_offset - selection_start, 0),
							end_offset: Math.min(
								range.end_offset - selection_start,
								selection_end - selection_start
							),
							node_id: range.node_id
						};
					} else {
						return null;
					}
				})
				.filter((range): range is Attachment => range !== null);

		const marks = clip_ranges(text_value.marks);
		const annotations = clip_ranges(text_value.annotations);

		return { content: selected_text, marks, annotations, nodes };
	}

	get_selected_annotated_nodes(): {
		nodes: Record<string, DocumentNode>;
		main_nodes: NodeId[];
		marks: Attachment[];
		annotations: Attachment[];
	} | null {
		if (this.selection?.type !== 'node') return null;

		const selection_start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
		const selection_end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
		const node_array: NodeArray = this.get(this.selection.path);
		const main_nodes = node_array.nodes.slice(selection_start, selection_end);
		const nodes: Record<string, DocumentNode> = {};

		const add_subgraph = (node_id: NodeId) => {
			for (const node of this.traverse(node_id)) {
				if (!nodes[node.id]) nodes[node.id] = node;
			}
		};

		for (const node_id of main_nodes) add_subgraph(node_id);

		const clip_ranges = (ranges: Attachment[]) =>
			ranges
				.map((range) => {
					if (selection_start >= range.end_offset || selection_end <= range.start_offset) {
						return null;
					}

					add_subgraph(range.node_id);
					return {
						start_offset: Math.max(range.start_offset - selection_start, 0),
						end_offset: Math.min(
							range.end_offset - selection_start,
							selection_end - selection_start
						),
						node_id: range.node_id
					};
				})
				.filter((range): range is Attachment => range !== null);

		const marks = clip_ranges(node_array.marks);
		const annotations = clip_ranges(node_array.annotations);

		return { nodes, main_nodes, marks, annotations };
	}

	// TODO: think about ways how we can also turn a node selection into plain text.
	get_selected_plain_text(): string | null {
		if (this.selection?.type !== 'text') return null;

		const start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
		const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
		const text: Text = this.get(this.selection.path);
		return char_slice(text.content, start, end);
	}

	get_selected_nodes(): NodeId[] | null {
		if (this.selection?.type !== 'node') return null;

		const start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
		const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
		const node_array: NodeArray = this.get(this.selection.path);
		// node_array.nodes is a plain array of id strings, so a slice is
		// already a safe fresh copy.
		return node_array.nodes.slice(start, end);
	}

	select_parent(): void {
		if (!this.selection) return;
		if (['text', 'property'].includes(this.selection.type)) {
			// For text and property selections (e.g. ['page_1', 'body', 0, 'image']), we need to go up two levels
			// in the path
			if (this.selection.path.length > 3) {
				const parent_path = this.selection.path.slice(0, -2);
				const current_index = this.selection.path[this.selection.path.length - 2] as number;
				this.selection = {
					type: 'node',
					path: parent_path,
					anchor_offset: current_index,
					focus_offset: current_index + 1
				};
			} else {
				this.selection = null;
			}
		} else if (this.selection.type === 'node') {
			// For node selections, we go up one level
			if (this.selection.path.length > 3) {
				const parent_path = this.selection.path.slice(0, -2);
				const current_index = this.selection.path[this.selection.path.length - 2] as number;

				this.selection = {
					type: 'node',
					path: parent_path,
					anchor_offset: current_index,
					focus_offset: current_index + 1
				};
			} else {
				this.selection = null;
			}
		} else {
			this.selection = null;
		}
	}

	/**
	 * Traverses the document and returns a list of nodes in depth-first order.
	 *
	 * The traversal order is:
	 * 1. Leaf nodes first
	 * 2. Branch nodes second
	 * 3. Root node (entry point) last
	 *
	 * Nodes that are not reachable from the entry point node will not be included.
	 */
	traverse(node_id: string): Array<DocumentNode> {
		// doc.nodes is a plain object — traverse() reads it directly and
		// deep-clones each visited node.
		return traverse(node_id, this.schema, this.doc.nodes);
	}

	/**
	 * Convert the document to a clean format for persistence.
	 *
	 * We make a traversal to ensure that orphaned nodes are not included,
	 * and that leaf nodes go first, followed by branches and the root node at last.
	 */
	to_json(): Document {
		// this will order the nodes (depth-first traversal)
		const nodes_array = this.traverse(this.document_id);
		// convert nodes array to object with node IDs as keys
		const nodes = Object.fromEntries(nodes_array.map((node) => [node.id, node]));
		return {
			document_id: this.document_id,
			nodes
		};
	}

	// property_type('page', 'body') => 'node_array'
	// property_type('paragraph', 'content') => 'text'
	property_type(type: string, property: string): string {
		return doc_property_type(this.schema, type, property);
	}

	// Count how many times a node is referenced in the document
	count_references(node_id: NodeId): number {
		return doc_count_references(this.schema, this.doc, node_id);
	}

	// Get all nodes referenced by a given node (recursively)
	get_referenced_nodes(node_id: NodeId): NodeId[] {
		// Id-only traversal — no need to deep-clone the subgraph for ids.
		return traverse_ids(node_id, this.schema, this.doc.nodes).slice(0, -1);
	}
}
