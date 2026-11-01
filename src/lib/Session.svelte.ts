import Transaction from './Transaction.svelte.js';
import { char_slice, traverse, traverse_ids, get_selection_range, paths_equal } from './utils.js';
import {
	resolve,
	property_type,
	kind,
	inspect,
	apply_op,
	op_node_id,
	count_references,
	validate_document_schema,
	validate_document,
	validate_config_components,
	validate_node,
	generate_id,
	get_referencing_node_ids,
	get_selected_attachments,
	validate_selection
} from './doc_utils.js';
import type { ResolveTracker, SelectedAttachment } from './doc_utils.js';
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
	SveditContext
} from './types.js';
import type { Keymap } from './KeyMapper.svelte.js';

const BATCH_WINDOW_MS = 1000;

type HistoryEntry = {
	ops: Transaction['ops'];
	inverse_ops: Transaction['inverse_ops'];
	selection_before: Selection | null;
	selection_after: Selection | null;
};

/**
 * Reactive state of a single node. Reading a node through Session.get only
 * subscribes to the cells of the nodes along the path, so an edit re-renders
 * only the components that depend on the changed nodes. `focus` holds the
 * selection while it lies in one of the node's properties.
 *
 * Passing through a node array by index subscribes to the node id at that
 * index only (its slot), so inserting a node doesn't re-render the nodes
 * before it.
 */
class NodeCell {
	node: DocumentNode | undefined = $state.raw();
	type: string | undefined = $state.raw();
	focus: Selection | null = $state.raw(null);
	slots = new Map<string, Slot[]>();
	constructor(node: DocumentNode) {
		this.node = node;
		this.type = node.type;
	}
}

class Slot {
	id: NodeId | undefined = $state.raw();
	constructor(id: NodeId) {
		this.id = id;
	}
}

export default class Session<S extends DocumentSchema = DocumentSchema> {
	schema: S = $state.raw() as S;
	config: SessionConfig = $state.raw({});
	history: HistoryEntry[] = $state.raw([]);
	history_index = $state.raw(-1);
	/** Timestamp of the open batch (see apply). Reset it to force a new history entry. */
	last_batch_started: number | undefined = $state.raw(undefined);

	// Commands and keymap, initialized by Svedit (one Svedit instance per session)
	commands: CommandRegistry = $state.raw({});
	keymap: Keymap = $state.raw({});

	#doc: Document = $state.raw() as Document;
	#selection: Selection | null = $state.raw(null);
	// Untracked mirror of #doc for internal reads
	#current!: Document;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Reactivity lives in the cells.
	#cells = new Map<NodeId, NodeCell>();
	#focus_owner: NodeId | null = null;

	can_undo = $derived(this.history_index >= 0);
	can_redo = $derived(this.history_index < this.history.length - 1);
	selected_node: AnyNode<S> | null = $derived(this.get_selected_node());
	available_mark_types = $derived(this.get_available_mark_types());
	available_annotation_types = $derived(this.get_available_annotation_types());
	selected_marks: SelectedAttachment[] = $derived(this.#get_selected('marks'));
	active_mark: SelectedAttachment | null = $derived(
		this.selected_marks.length === 1 ? this.selected_marks[0] : null
	);
	selected_annotations: SelectedAttachment[] = $derived(this.#get_selected('annotations'));
	active_annotation: SelectedAttachment | null = $derived(
		this.selected_annotations.length === 1 ? this.selected_annotations[0] : null
	);

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
		validate_document_schema(schema);
		this.schema = schema;
		this.config = config;
		validate_document(doc, schema);
		validate_config_components(schema, config);
		this.#commit(doc);
		this.selection = options.selection ?? null;
	}

	/** Tracked node lookup: subscribes to the node's cell only. */
	#lookup = (node_id: NodeId): DocumentNode | undefined => {
		const cell = this.#cells.get(node_id);
		if (cell) return cell.node;
		// Unknown ids depend on the whole document, as they may appear later
		void this.#doc;
		return undefined;
	};

	/** Untracked node lookup for path resolution, which subscribes via #tracker. */
	#peek = (node_id: NodeId): DocumentNode | undefined => {
		const node = this.#current.nodes[node_id];
		if (!node) void this.#doc;
		return node;
	};

	#tracker: ResolveTracker = {
		node: (node) => void this.#cells.get(node.id)?.node,
		type: (node) => void this.#cells.get(node.id)?.type,
		slot: (owner, property, index) => {
			const cell = this.#cells.get(owner.id);
			const slot = cell?.slots.get(property)?.[index];
			// Without a slot at the index, depend on the whole node
			void (slot ? slot.id : cell?.node);
		}
	};

	/** Swap in a new document and notify the cells of changed nodes. */
	#commit(doc: Document, changed_ids?: Iterable<NodeId>): void {
		const previous = this.#current;
		this.#current = doc;
		this.#doc = doc;
		const ids =
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local set.
			changed_ids ?? new Set([...Object.keys(previous?.nodes ?? {}), ...Object.keys(doc.nodes)]);
		for (const id of ids) {
			const node = doc.nodes[id];
			let cell = this.#cells.get(id);
			if (cell) {
				cell.node = node;
				cell.type = node?.type;
			} else if (node) {
				this.#cells.set(id, (cell = new NodeCell(node)));
			}
			if (cell) this.#update_slots(cell, node);
		}
	}

	/** Update the slots of a node's arrays, notifying only changed indexes. */
	#update_slots(cell: NodeCell, node: DocumentNode | undefined): void {
		const properties = node ? this.schema[node.type]?.properties : undefined;
		for (const [property, slots] of cell.slots) {
			if (properties?.[property]?.type !== 'node_array') {
				for (const slot of slots) slot.id = undefined;
			}
		}
		if (!properties) return;
		for (const [property, definition] of Object.entries(properties)) {
			if (definition.type !== 'node_array') continue;
			const ids: NodeId[] = node![property]?.nodes ?? [];
			let slots = cell.slots.get(property);
			if (!slots) cell.slots.set(property, (slots = []));
			for (let index = 0; index < ids.length || index < slots.length; index++) {
				if (index >= slots.length) slots.push(new Slot(ids[index]));
				else if (slots[index].id !== ids[index]) slots[index].id = ids[index];
			}
		}
	}

	/** The document. Assigning a new document re-renders changed nodes. */
	get doc(): Document {
		return this.#doc;
	}

	set doc(doc: Document) {
		this.#commit(doc);
		this.#update_focus(this.#selection);
	}

	get selection(): Selection | null {
		return this.#selection;
	}

	/** @throws {Error} Throws if the selection is invalid */
	set selection(value: Selection | null) {
		validate_selection(value, this);
		this.#selection = value;
		this.#update_focus(value);
	}

	#update_focus(selection: Selection | null): void {
		let owner: NodeId | null = null;
		try {
			const path = selection?.path.slice(0, -1);
			if (path?.length)
				owner = resolve(this.schema, path, (id) => this.#current.nodes[id])?.id ?? null;
		} catch {
			// A selection that no longer resolves (e.g. after `session.doc = ...`) has no owner
		}
		if (this.#focus_owner !== owner) {
			const previous = this.#focus_owner && this.#cells.get(this.#focus_owner);
			if (previous) previous.focus = null;
			this.#focus_owner = owner ?? null;
		}
		const cell = owner && this.#cells.get(owner);
		if (cell) cell.focus = selection;
	}

	/**
	 * The selection if its path is exactly `path`, otherwise null. Only
	 * re-evaluates when the selection enters, moves within, or leaves the
	 * node owning that path, which keeps per-component selection checks O(1).
	 */
	selection_at(path: DocumentPath): Selection | null {
		if (path.length < 2) return null;
		// Only which node owns the path matters, not its content
		const owner = resolve(this.schema, path.slice(0, -1), this.#peek, this.#tracker, false);
		const selection = owner?.id ? this.#cells.get(owner.id)?.focus : null;
		return selection && paths_equal(selection.path, path) ? selection : null;
	}

	get document_id(): string {
		return this.#doc.document_id;
	}

	/**
	 * Validates the nodes a transaction can have invalidated: created and
	 * modified nodes, plus nodes still referencing deleted nodes or nodes
	 * whose type changed. This avoids scanning the document on every apply.
	 *
	 * @throws {Error} Throws if the transaction result is invalid
	 */
	validate_transaction_result(transaction: Transaction): void {
		const doc = transaction.doc;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local set.
		const affected = new Set([...transaction.created_node_ids, ...transaction.modified_node_ids]);
		// References to created nodes can only live in created or modified
		// nodes, so only deletions and type changes need a referrer scan.
		if (transaction.deleted_node_ids.size > 0 || transaction.changed_node_types) {
			const targets = [...affected, ...transaction.deleted_node_ids];
			for (const id of get_referencing_node_ids(this.schema, doc, targets)) affected.add(id);
		}
		for (const id of affected) {
			const node = doc.nodes[id];
			if (node) validate_node(node, this.schema, doc.nodes);
		}
	}

	generate_id(): string {
		return generate_id(this.config);
	}

	/**
	 * Initialize commands and keymap from config.create_commands_and_keymap.
	 * Called by Svedit with its context (one Svedit instance per session).
	 */
	initialize_commands(context: SveditContext<S>): void {
		if (!this.config?.create_commands_and_keymap) return;
		const { commands, keymap } = this.config.create_commands_and_keymap(context);
		this.commands = commands;
		this.keymap = keymap;
	}

	#allowed_types(key: 'mark_types' | 'annotation_types'): string[] {
		const selection = this.selection;
		if (selection?.type !== 'text' && selection?.type !== 'node') return [];
		return this.inspect(selection.path)[key] || [];
	}

	get_available_mark_types(): string[] {
		return this.#allowed_types('mark_types');
	}

	get_available_annotation_types(): string[] {
		return this.#allowed_types('annotation_types');
	}

	#get_selected(key: 'marks' | 'annotations'): SelectedAttachment[] {
		const selection = this.selection;
		if (selection?.type !== 'text' && selection?.type !== 'node') return [];
		return get_selected_attachments(this.get(selection.path), selection, key, this.#lookup);
	}

	/**
	 * The single selected node of a node selection, or the node owning the
	 * property of a text or property selection.
	 */
	get_selected_node(): AnyNode<S> | null {
		const selection = this.selection;
		if (!selection) return null;
		if (selection.type !== 'node') return this.get(selection.path.slice(0, -1)) ?? null;
		const { start_offset, end_offset } = get_selection_range(selection)!;
		if (end_offset - start_offset !== 1) return null;
		const node_id = this.get(selection.path).nodes[start_offset];
		return node_id ? this.get(node_id) : null;
	}

	/** A new transaction for making atomic changes to the document. */
	get tr(): Transaction {
		return new Transaction(this.schema, this.#doc, this.selection, this.config);
	}

	/**
	 * Applies a transaction to the document. With `batch: true`, it merges
	 * into the previous history entry while within the batch window.
	 */
	apply(transaction: Transaction, { batch = false }: { batch?: boolean } = {}): this {
		this.validate_transaction_result(transaction);
		if (transaction.ops.length > 0) {
			this.#commit(transaction.doc, [
				...transaction.created_node_ids,
				...transaction.modified_node_ids,
				...transaction.deleted_node_ids
			]);
		}
		// A fresh reference, so the selection gets rerendered
		this.selection = structuredClone(transaction.selection);

		const history = this.history.slice(0, this.history_index + 1);
		const now = Date.now();
		const entry = history[this.history_index];
		if (
			batch &&
			entry &&
			this.last_batch_started !== undefined &&
			now - this.last_batch_started < BATCH_WINDOW_MS
		) {
			history[this.history_index] = {
				...entry,
				ops: [...entry.ops, ...transaction.ops],
				inverse_ops: [...entry.inverse_ops, ...transaction.inverse_ops],
				selection_after: this.selection
			};
		} else {
			history.push({
				ops: transaction.ops,
				inverse_ops: transaction.inverse_ops,
				selection_before: transaction.selection_before,
				selection_after: this.selection
			});
			this.history_index = history.length - 1;
			this.last_batch_started = batch ? now : undefined;
		}
		this.history = history;
		return this;
	}

	#replay(ops: Transaction['ops'], selection: Selection | null): void {
		const draft = { ...this.#current, nodes: { ...this.#current.nodes } };
		for (const op of ops) apply_op(draft, op, (value) => $state.snapshot(value) as typeof value);
		this.#commit(draft, ops.map(op_node_id));
		this.selection = selection;
		// History navigation ends any open typing batch
		this.last_batch_started = undefined;
	}

	undo(): this | undefined {
		if (this.history_index < 0) return;
		const entry = this.history[this.history_index];
		this.#replay([...entry.inverse_ops].reverse(), entry.selection_before);
		this.history_index -= 1;
		return this;
	}

	redo(): this | undefined {
		if (this.history_index >= this.history.length - 1) return;
		this.history_index += 1;
		const entry = this.history[this.history_index];
		this.#replay(entry.ops, entry.selection_after);
		return this;
	}

	/**
	 * Gets a node or property value at a path. The result type defaults to
	 * `any`, since a path can address any value; annotate the target to type it.
	 *
	 * @example
	 * session.get('list_1') // => { type: 'list', id: 'list_1', ... }
	 * session.get(['list_1', 'list_items']) // => { nodes: ['list_item_1'], marks: [], annotations: [] }
	 * session.get(['page_1', 'body', 3, 'list_items', 0]) // => { type: 'list_item', id: 'list_item_1', ... }
	 * session.get(['page_1', 'cover', 'title']) // => {content: 'Hello world', marks: [], annotations: []}
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	get<T = any>(path: DocumentPath | string): T {
		return resolve(this.schema, path, this.#peek, this.#tracker);
	}

	/**
	 * Type information about the value at a path.
	 *
	 * @example
	 * session.inspect(['page_1', 'body']) => {
	 *   kind: 'property', name: 'body', type: 'node_array',
	 *   node_types: ['text', 'story', 'list'], default_node_type: 'text'
	 * }
	 * session.inspect(['page_1', 'body', 1]) => {
	 *   kind: 'node', id: 'paragraph_234', type: 'paragraph', properties: {...}
	 * }
	 */
	inspect(path: DocumentPath): Inspection {
		return inspect(this.schema, path, this.#lookup);
	}

	/** The kind of a node: 'document', 'block', 'text', 'mark' or 'annotation'. */
	kind(node: DocumentNode): NodeKind {
		return kind(this.schema, node);
	}

	/** Whether a node type can be inserted at the selection or an ancestor caret. */
	can_insert(node_type: string, selection: Selection | null = this.selection): boolean {
		for (let caret = selection; caret; caret = this.get_next_node_insert_caret(caret)) {
			if (caret.type === 'node' && this.inspect(caret.path).node_types.includes(node_type))
				return true;
		}
		return false;
	}

	/**
	 * The next possible node insert position after the innermost node array
	 * entry along the selection path, or null if there is none.
	 */
	get_next_node_insert_caret(selection: Selection | null = this.selection): Selection | null {
		if (!selection) return null;
		// Single-node references can sit between arrays, so look for indexes
		for (let index = selection.path.length - 1; index >= 1; index--) {
			const node_index = selection.path[index];
			if (typeof node_index !== 'number') continue;
			const path = selection.path.slice(0, index);
			if (this.inspect(path).type !== 'node_array') continue;
			return { type: 'node', path, anchor_offset: node_index + 1, focus_offset: node_index + 1 };
		}
		return null;
	}

	/**
	 * Clip ranges to the selected range [start, end) and collect the payload
	 * subgraphs of the remaining ranges into `nodes`.
	 */
	#clip_ranges(
		ranges: Attachment[],
		start: number,
		end: number,
		nodes: Record<string, DocumentNode>
	): Attachment[] {
		return ranges.flatMap((range) => {
			if (start >= range.end_offset || end <= range.start_offset) return [];
			this.#collect(range.node_id, nodes);
			return [
				{
					start_offset: Math.max(range.start_offset - start, 0),
					end_offset: Math.min(range.end_offset - start, end - start),
					node_id: range.node_id
				}
			];
		});
	}

	#collect(node_id: NodeId, nodes: Record<string, DocumentNode>): void {
		for (const node of this.traverse(node_id)) nodes[node.id] ??= node;
	}

	get_selected_text(): (Text & { nodes: Record<string, DocumentNode> }) | null {
		if (this.selection?.type !== 'text') return null;
		const { start_offset, end_offset } = get_selection_range(this.selection)!;
		const text: Text = this.get(this.selection.path);
		const nodes: Record<string, DocumentNode> = {};
		return {
			content: char_slice(text.content, start_offset, end_offset),
			marks: this.#clip_ranges(text.marks, start_offset, end_offset, nodes),
			annotations: this.#clip_ranges(text.annotations, start_offset, end_offset, nodes),
			nodes
		};
	}

	get_selected_annotated_nodes(): {
		nodes: Record<string, DocumentNode>;
		main_nodes: NodeId[];
		marks: Attachment[];
		annotations: Attachment[];
	} | null {
		if (this.selection?.type !== 'node') return null;
		const { start_offset, end_offset } = get_selection_range(this.selection)!;
		const node_array: NodeArray = this.get(this.selection.path);
		const main_nodes = node_array.nodes.slice(start_offset, end_offset);
		const nodes: Record<string, DocumentNode> = {};
		for (const node_id of main_nodes) this.#collect(node_id, nodes);
		return {
			nodes,
			main_nodes,
			marks: this.#clip_ranges(node_array.marks, start_offset, end_offset, nodes),
			annotations: this.#clip_ranges(node_array.annotations, start_offset, end_offset, nodes)
		};
	}

	get_selected_plain_text(): string | null {
		if (this.selection?.type !== 'text') return null;
		const { start_offset, end_offset } = get_selection_range(this.selection)!;
		return char_slice(this.get(this.selection.path).content, start_offset, end_offset);
	}

	get_selected_nodes(): NodeId[] | null {
		if (this.selection?.type !== 'node') return null;
		const { start_offset, end_offset } = get_selection_range(this.selection)!;
		return this.get(this.selection.path).nodes.slice(start_offset, end_offset);
	}

	/** Select the node that contains the current selection (or clear it at the top). */
	select_parent(): void {
		const path = this.selection?.path;
		if (!path) return;
		if (path.length <= 3) {
			this.selection = null;
			return;
		}
		const index = path.at(-2) as number;
		this.selection = {
			type: 'node',
			path: path.slice(0, -2),
			anchor_offset: index,
			focus_offset: index + 1
		};
	}

	/**
	 * Deep copies of the nodes reachable from a node in depth-first order:
	 * leaves first, branches second, the entry point last.
	 */
	traverse(node_id: string): Array<DocumentNode> {
		return traverse(node_id, this.schema, this.#doc.nodes);
	}

	/**
	 * The document in a clean format for persistence: orphaned nodes are
	 * dropped, leaves come first and the root node last.
	 */
	to_json(): Document {
		const nodes = Object.fromEntries(
			this.traverse(this.document_id).map((node) => [node.id, node])
		);
		return { document_id: this.document_id, nodes };
	}

	// property_type('page', 'body') => 'node_array'
	property_type(type: string, property: string): string {
		return property_type(this.schema, type, property);
	}

	count_references(node_id: NodeId): number {
		return count_references(this.schema, this.#doc, node_id);
	}

	/** All nodes referenced by a node, recursively. */
	get_referenced_nodes(node_id: NodeId): NodeId[] {
		return traverse_ids(node_id, this.schema, this.#doc.nodes).slice(0, -1);
	}
}
