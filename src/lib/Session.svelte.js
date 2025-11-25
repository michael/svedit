import Transaction from './Transaction.svelte.js';
import { char_slice, get_char_length, traverse, get_selection_range } from './utils.js';
import {
	get as doc_get,
	property_type as doc_property_type,
	kind as doc_kind,
	inspect as doc_inspect,
	apply_op,
	count_references as doc_count_references,
	validate_document_schema,
	validate_node
} from './doc_utils.js';

/**
 * @import {
 *   NodeId,
 *   DocumentPath,
 *   Selection,
 *   Annotation,
 *   PrimitiveType,
 *   NodeProperty,
 *   NodeArrayProperty,
 *   NodeKind,
 *   NodeSchema,
 *   DocumentSchema,
 *   DocumentNode,
 *   Document
 * } from './types.d.ts';
 */

const BATCH_WINDOW_MS = 1000; // 1 second

/**
 * @typedef {Object} SessionOptions
 * @property {Selection} [selection] - Initial selection state
 * @property {any} [config] - Editor configuration
 */

export default class Session {
	/** @type {Selection | undefined} */
	#selection = $state.raw();

	/** @type {DocumentSchema} */
	schema = $state.raw();

	/** @type {Document} */
	doc = $state.raw();

	/** @type {any} */
	config = $state.raw();

	history = $state.raw([]);
	history_index = $state.raw(-1);
	last_batch_started = $state.raw(undefined); // Timestamp for debounced batching

	// Commands and keymap - initialized by Svedit when ready
	// NOTE: Assumes single Svedit instance per session
	commands = $state.raw({});
	keymap = $state.raw({});

	// Reactive helpers for UI state
	can_undo = $derived(this.history_index >= 0);
	can_redo = $derived(this.history_index < this.history.length - 1);

	// Reactive variable for selected node
	selected_node = $derived(this.get_selected_node());
	available_annotation_types = $derived(this.get_available_annotation_types());

	/**
	 * Gets the current selection
	 * @returns {Selection | undefined}
	 */
	get selection() {
		return this.#selection;
	}

	/**
	 * Sets the selection with validation
	 * @param {Selection | undefined} value - The new selection
	 * @throws {Error} Throws if the selection is invalid
	 */
	set selection(value) {
		// if (value !== undefined) {
		//   this._validate_selection(value);
		// }
		this.#selection = value;
	}

	/**
	 * Validates that a selection is within bounds and refers to valid paths.
	 *
	 * @param {Selection} selection - The selection to validate
	 * @throws {Error} Throws if the selection is invalid
	 * @private
	 */
	_validate_selection(selection) {
		if (!selection) return; // no selection is a valid selection
		if (selection && !Array.isArray(selection.path)) {
			throw new Error('Selection must have a valid path');
		}

		const selection_type = selection.type;
		if (selection_type === 'node') {
			// For node selections, path should point to a node_array
			if (this.inspect(selection.path).type !== 'node_array') {
				throw new Error(
					`Node selection path does not point to a node array: ${selection.path.join('.')}`
				);
			}

			const node_array = this.get(selection.path);

			// Validate anchor_offset and focus_offset are within bounds
			const max_offset = node_array.length;

			if (selection.anchor_offset < 0 || selection.anchor_offset > max_offset) {
				throw new Error(
					`Node selection anchor_offset ${selection.anchor_offset} is out of bounds (0-${max_offset})`
				);
			}

			if (selection.focus_offset < 0 || selection.focus_offset > max_offset) {
				throw new Error(
					`Node selection focus_offset ${selection.focus_offset} is out of bounds (0-${max_offset})`
				);
			}
		} else if (selection_type === 'text') {
			// For text selections, path should point to an annotated_text property
			const annotated_text = this.get(selection.path);

			// Validate anchor_offset and focus_offset are within text bounds
			const char_length = get_char_length(annotated_text.text);

			if (selection.anchor_offset < 0 || selection.anchor_offset > char_length) {
				throw new Error(
					`Text selection anchor_offset ${selection.anchor_offset} is out of bounds (0-${char_length})`
				);
			}

			if (selection.focus_offset < 0 || selection.focus_offset > char_length) {
				throw new Error(
					`Text selection focus_offset ${selection.focus_offset} is out of bounds (0-${char_length})`
				);
			}
		} else if (selection_type === 'property') {
			// For property selections, just validate the path exists
			if (!this.inspect(selection.path)) {
				throw new Error(`Property selection path not found: ${selection.path.join('.')}`);
			}
		} else {
			throw new Error(`Unknown selection type: ${selection_type}`);
		}
	}

	/**
	 * @param {DocumentSchema} schema - The document schema
	 * @param {Document} doc - The document
	 * @param {SessionOptions} [options] - Optional configuration
	 */
	constructor(schema, doc, options = {}) {
		const { selection, config } = options;

		// Validate the schema first
		validate_document_schema(schema);

		this.schema = schema;
		this.doc = doc;
		this.config = config;

		// Set selection after doc is initialized so validation can work properly
		this.selection = selection;
	}

	/**
	 * Gets the document_id from the doc
	 * @returns {string}
	 */
	get document_id() {
		return this.doc.document_id;
	}

	validate_doc() {
		for (const node of Object.values(this.doc.nodes)) {
			validate_node(node, this.schema, this.doc.nodes);
		}
	}

	generate_id() {
		if (this.config?.generate_id) {
			return this.config.generate_id();
		} else {
			return crypto.randomUUID();
		}
	}

	/**
	 * Initialize commands and keymap for this session.
	 * Called by Svedit component when it has the necessary context.
	 *
	 * NOTE: This assumes a single Svedit instance per session.
	 * For multiple editors on the same document, this architecture would need
	 * to be refactored to support multiple sessions per document.
	 *
	 * @param {object} context - The svedit context with session, editable, canvas, etc.
	 */
	initialize_commands(context) {
		if (this.config?.create_commands_and_keymap) {
			const { commands, keymap } = this.config.create_commands_and_keymap(context);
			this.commands = commands;
			this.keymap = keymap;
		}
	}

	get_available_annotation_types() {
		if (this.selection?.type !== 'text') return [];
		const path = this.selection.path;
		const property_definition = this.inspect(path);
		return property_definition.node_types || [];
	}

	// Helper function to get the currently selected node
	get_selected_node() {
		if (!this.selection) return null;

		if (this.selection.type === 'node') {
			const start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
			const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
			// Only consider selection of a single node
			if (end - start !== 1) return null;
			const node_array = this.get(this.selection.path);
			const node_id = node_array[start];
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
	 *
	 * @returns {Transaction} A new transaction instance
	 */
	get tr() {
		// We create a copy of the current state to avoid modifying the original
		return new Transaction(this.schema, this.doc, this.selection, this.config);
	}

	/**
	 * Applies a transaction to the document.
	 * Auto-batches history entries with debounced behavior (max one entry per 2 seconds) when batch is true.
	 *
	 * @param {Transaction} transaction - The transaction to apply
	 * @param {object} [options] - Optional configuration
	 * @param {boolean} [options.batch=false] - Whether to allow batching with previous transaction
	 */
	apply(transaction, { batch = false } = {}) {
		this.doc = transaction.doc;
		// Make sure selection gets a new reference (is rerendered)
		this.selection = structuredClone(transaction.selection);
		if (this.history_index < this.history.length - 1) {
			this.history = this.history.slice(0, this.history_index + 1);
		}

		const now = Date.now();
		const should_batch =
			batch &&
			this.last_batch_started !== undefined &&
			now - this.last_batch_started < BATCH_WINDOW_MS;

		if (should_batch) {
			// Append to existing history entry (within 2s of batch start)
			const last_entry = this.history[this.history_index];
			last_entry.ops.push(...transaction.ops);
			last_entry.inverse_ops.push(...transaction.inverse_ops);
			last_entry.selection_after = this.selection;
			// Trigger update
			this.history = [...this.history];
		} else {
			// Create new history entry (more than 2s since batch started, or first edit, or batch not requested)
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

		return this;
	}

	undo() {
		if (this.history_index < 0) {
			return;
		}
		const change = this.history[this.history_index];
		let doc = this.doc;
		change.inverse_ops
			.slice()
			.reverse()
			.forEach((op) => {
				doc = apply_op(doc, op);
			});
		this.doc = doc;
		this.selection = change.selection_before;
		this.history_index = this.history_index - 1;
		return this;
	}

	redo() {
		if (this.history_index >= this.history.length - 1) {
			return;
		}
		this.history_index = this.history_index + 1;
		const change = this.history[this.history_index];
		let doc = this.doc;
		change.ops.forEach((op) => {
			doc = apply_op(doc, op);
		});
		this.doc = doc;
		this.selection = change.selection_after;
		return this;
	}

	/**
	 * Gets a node instance or property value at the specified path.
	 * @param {DocumentPath|string} path - Path to the node or property
	 * @returns {any} Either a node instance object or the value of a property
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
	 * // Get an annotated text property
	 * session.get(['page_1', 'cover', 'title']) // => {text: 'Hello world', annotations: []}
	 */
	get(path) {
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
	 *
	 * @param {DocumentPath} path
	 * @returns {{kind: 'property'|'node', [key: string]: any}}
	 */
	inspect(path) {
		return doc_inspect(this.schema, this.doc, path);
	}

	/**
	 * Determines the kind of a node ('block' for structured blocks, 'text' for pure
	 * text nodes or 'annotation' for annotation nodes.
	 * @param {any} node
	 * @returns {NodeKind}
	 */
	kind(node) {
		return doc_kind(this.schema, node);
	}

	/**
	 * Determines whether a node type can be inserted at a given selection.
	 * @param {string} node_type - The type of node to insert.
	 * @param {Selection} [selection] - The selection at which to insert the node.
	 * @returns {boolean} True if the node type can be inserted, false otherwise.
	 */
	can_insert(node_type, selection = this.selection) {
		if (selection?.type === 'node') {
			const property_definition = this.inspect(selection.path);
			if (property_definition.node_types.includes(node_type)) {
				return true;
			}
		}

		// No insert position found yet, and root not reached, try one level up if possible
		let next_node_insert_cursor = this.get_next_node_insert_cursor(selection);
		if (!next_node_insert_cursor) return false;
		return this.can_insert(node_type, next_node_insert_cursor);
	}

	/**
	 * Compute next possible insert position from a given selection
	 *
	 * @param {Selection} [selection] - Reference selection
	 * @returns {Selection} True if the paste operation was successful, false otherwise
	 */
	get_next_node_insert_cursor(selection = this.selection) {
		// There's no parent path to insert into
		if (!selection || selection.path.length <= 2) {
			return null;
		}

		const node_offset = parseInt(String(selection.path.at(-2)), 10) + 1;
		return {
			type: 'node',
			path: selection.path.slice(0, -2),
			anchor_offset: node_offset,
			focus_offset: node_offset
		};
	}

	/**
	 * Returns the annotation object that is currently "under the cursor".
	 * NOTE: Annotations in Svedit are exclusive, so there can only be one active_annotation
	 *
	 * @param {string} annotation_type
	 * @returns {Annotation|null}
	 */
	active_annotation(annotation_type) {
		if (this.selection?.type !== 'text') return null;

		const { start, end } = get_selection_range(this.selection);
		const annotated_text = this.get(this.selection.path);
		const annotations = annotated_text.annotations;

		const active_annotation =
			annotations.find(
				({ start_offset, end_offset }) =>
					(start_offset <= start && end_offset > start) ||
					(start_offset < end && end_offset >= end) ||
					(start_offset >= start && end_offset <= end)
			) || null;

		if (annotation_type && active_annotation) {
			const annotation_node = this.get(active_annotation?.node_id);
			return annotation_node?.type === annotation_type ? active_annotation : null;
		} else {
			return active_annotation;
		}
	}

	get_selected_annotated_text() {
		if (this.selection?.type !== 'text') return null;

		const selection_start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
		const selection_end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
		const annotated_text = this.get(this.selection.path);
		const text = char_slice(annotated_text.text, selection_start, selection_end);
		const nodes = {};
		const annotations = annotated_text.annotations
			.map((a) => {
				if (selection_start < a.end_offset && selection_end > a.start_offset) {
					const sub_graph = this.traverse(a.node_id);
					for (const node of sub_graph) {
						if (!nodes[node.id]) {
							nodes[node.id] = node;
						}
					}
					return {
						start_offset: Math.max(a.start_offset - selection_start, 0),
						end_offset: Math.min(a.end_offset - selection_start, selection_end - selection_start),
						node_id: a.node_id
					};
				} else {
					return null;
				}
			})
			.filter(Boolean);

		return { text, annotations, nodes };
	}

	// TODO: think about ways how we can also turn a node selection into plain text.
	get_selected_plain_text() {
		if (this.selection?.type !== 'text') return null;

		const start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
		const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
		const annotated_text = this.get(this.selection.path);
		return char_slice(annotated_text.text, start, end);
	}

	get_selected_nodes() {
		if (this.selection?.type !== 'node') return null;

		const start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
		const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
		const node_array = this.get(this.selection.path);
		return $state.snapshot(node_array.slice(start, end));
	}

	select_parent() {
		if (!this.selection) return;
		if (['text', 'property'].includes(this.selection?.type)) {
			// For text and property selections (e.g. ['page_1', 'body', 0, 'image']), we need to go up two levels
			// in the path
			if (this.selection.path.length > 3) {
				const parent_path = this.selection.path.slice(0, -2);
				const current_index = parseInt(String(this.selection.path[this.selection.path.length - 2]));
				this.selection = {
					type: 'node',
					path: parent_path,
					anchor_offset: current_index,
					focus_offset: current_index + 1
				};
			} else {
				this.selection = undefined;
			}
		} else if (this.selection.type === 'node') {
			// For node selections, we go up one level
			if (this.selection.path.length > 3) {
				const parent_path = this.selection.path.slice(0, -2);
				const current_index = parseInt(String(this.selection.path[this.selection.path.length - 2]));

				this.selection = {
					type: 'node',
					path: parent_path,
					anchor_offset: current_index,
					focus_offset: current_index + 1
				};
			} else {
				this.selection = undefined;
			}
		} else {
			this.selection = undefined;
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
	 * @param {string} node_id - The ID of the node to start traversing from
	 * @returns {Array<DocumentNode>} Array of nodes in depth-first order
	 * @note Nodes that are not reachable from the entry point node will not be included
	 */
	traverse(node_id) {
		return traverse(node_id, this.schema, $state.snapshot(this.doc.nodes));
	}

	/**
	 * Convert the document to a clean format for persistence.
	 *
	 * We make a traversal to ensure that orphaned nodes are not included,
	 * and that leaf nodes go first, followed by branches and the root node at last.
	 *
	 * @returns {Document} The document
	 */
	to_json() {
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
	// property_type('paragraph', 'content') => 'annotated_text'
	property_type(type, property) {
		return doc_property_type(this.schema, type, property);
	}

	// Count how many times a node is referenced in the document
	count_references(node_id) {
		return doc_count_references(this.schema, this.doc, node_id);
	}

	// Get all nodes referenced by a given node (recursively)
	/**
	 * @param {NodeId} node_id
	 * @returns {NodeId[]}
	 */
	get_referenced_nodes(node_id) {
		const traversed_nodes = this.traverse(node_id);

		// Extract IDs and exclude the last element (root node)
		return traversed_nodes.slice(0, -1).map((node) => node.id);
	}
}
