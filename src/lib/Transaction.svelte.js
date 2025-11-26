/**
 * @import { NodeId, Selection, DocumentPath } from './types.d.js'
 */

import {
	get_char_length,
	char_slice,
	traverse,
	get_selection_range,
	is_selection_collapsed
} from './utils.js';
import { join_text_node } from './transforms.svelte.js';
import {
	get as doc_get,
	property_type as doc_property_type,
	kind as doc_kind,
	inspect as doc_inspect,
	apply_op,
	count_references_excluding_deleted,
	validate_node
} from './doc_utils.js';

/**
 * Transaction class for managing atomic document operations with undo/redo support.
 *
 * A Transaction provides a way to group multiple document operations (create, delete, set)
 * into a single atomic unit that can be applied or rolled back as one. It maintains
 * both forward operations and their inverse operations for undo functionality.
 *
 * @example
 * ```js
 * const tr = session.tr;
 * tr.set(['node_1', 'title'], 'New Title');
 * tr.create({id: 'node_2', type: 'paragraph', content: 'Hello'});
 * session.apply(tr); // Applies all operations atomically
 * ```
 */
export default class Transaction {
	/**
	 * Creates a new Transaction with the given state.
	 *
	 * @param {object} schema - The document schema
	 * @param {object} doc - The document state {document_id, nodes}
	 * @param {Selection} selection - The current selection
	 * @param {object} config - The document config (including generate_id)
	 */
	constructor(schema, doc, selection, config) {
		this.schema = schema;
		/** @type {object} */
		this.doc = doc;
		/** @type {Selection} */
		this.selection = selection;
		this.config = config;
		// Here we track the ops during the transaction
		/** @type {Record<string, any>[]} */
		this.ops = [];
		/** @type {Record<string, any>[]} */
		this.inverse_ops = [];
		// Remember the selection before the transaction started
		this.selection_before = selection;
	}

	/**
	 * Gets a value from the document at the specified path.
	 *
	 * @param {DocumentPath} path - The path to the value in the document
	 * @returns {any} The value at the specified path
	 */
	get(path) {
		return doc_get(this.schema, this.doc, path);
	}

	/**
	 * Gets the type of a property from the schema.
	 *
	 * @param {string} type - The node type
	 * @param {string} property - The property name
	 * @returns {string} The property type
	 */
	property_type(type, property) {
		return doc_property_type(this.schema, type, property);
	}

	/**
	 * Determines the kind of a node ('block', 'text', or 'annotation').
	 *
	 * @param {any} node - The node to check
	 * @returns {'block'|'text'|'annotation'} The node kind
	 */
	kind(node) {
		return doc_kind(this.schema, node);
	}

	/**
	 * Inspects a path to get metadata about the value at that location.
	 *
	 * @param {DocumentPath} path - The path to inspect
	 * @returns {{kind: 'property'|'node', [key: string]: any}} Metadata about the path
	 */
	inspect(path) {
		return doc_inspect(this.schema, this.doc, path);
	}

	/**
	 * Generates a new unique ID using the config's generate_id function.
	 *
	 * @returns {string} A new unique ID
	 */
	generate_id() {
		return this.config.generate_id();
	}

	/**
	 * Validates a node against the document schema.
	 *
	 * @param {any} node - The node to validate
	 * @throws {Error} Throws if the node is invalid
	 */
	validate_node(node) {
		validate_node(node, this.schema, this.doc.nodes);
	}

	/**
	 * Gets all nodes referenced by a given node (recursively).
	 *
	 * @param {NodeId} node_id - The node ID to get references for
	 * @returns {NodeId[]} Array of referenced node IDs
	 */
	get_referenced_nodes(node_id) {
		const traversed_nodes = traverse(node_id, this.schema, this.doc.nodes);
		return traversed_nodes.slice(0, -1).map((node) => node.id);
	}

	/**
	 * Gets the available annotation types for the current selection.
	 *
	 * @returns {string[]} Array of available annotation type names
	 */
	get available_annotation_types() {
		if (this.selection?.type !== 'text') return [];
		const path = this.selection.path;
		const property_definition = this.inspect(path);
		return property_definition.node_types || [];
	}

	/**
	 * Gets the currently active annotation at the selection, optionally filtered by type.
	 *
	 * @param {string} [type] - Optional annotation type to filter by
	 * @returns {any} The active annotation or undefined
	 */
	active_annotation(type) {
		if (this.selection?.type !== 'text') return undefined;
		const { start, end } = get_selection_range(this.selection);
		const annotated_text = this.get(this.selection.path);
		const annotations = annotated_text.annotations;

		const active_annotation = annotations.find(
			/** @param {any} annotation */ (annotation) =>
				annotation.start_offset <= start &&
				annotation.end_offset >= end &&
				(type ? this.get(annotation.node_id).type === type : true)
		);
		if (!active_annotation) return undefined;
		const annotation_node = this.get(active_annotation.node_id);
		return {
			...active_annotation,
			type: annotation_node.type,
			node: annotation_node
		};
	}

	/**
	 * Applies an operation to the document (internal).
	 *
	 * @param {Array} op - The operation to apply
	 * @private
	 */
	_apply_op(op) {
		this.doc = apply_op(this.doc, op);
	}

	/**
	 * Sets a property of a node to a new value.
	 *
	 * This is the core operation for modifying document properties. It records
	 * both the forward operation and its inverse for undo support.
	 *
	 * @param {DocumentPath} path - Array path to the property (e.g., ["node_1", "title"])
	 * @param {any} value - The new value to set
	 * @returns {Transaction} This transaction instance for method chaining
	 *
	 * @example
	 * ```js
	 * tr.set(["list_1", "list_items"], [1, 2, 3]);
	 * tr.set(["page_1", "body", "0", "description"], {text: "Hello world", annotations: []});
	 * ```
	 */
	set(path, value) {
		const node = this.get(path.slice(0, -1));

		// Turns ["page_1", "body", "0", "description"]
		// into ["paragraph_1", "description"].
		// Important to keep changes of multiple ops invertible.
		const normalized_path = [node.id, path.at(-1)];

		// Just to be sure, make a deep copy of the old value
		const property_key = path.at(-1);
		if (property_key === undefined) {
			throw new Error('Invalid path: cannot get property key');
		}
		const property_key_str = String(property_key);
		const previous_value = structuredClone($state.snapshot(node[property_key_str]));

		// Collect node IDs that might need to be deleted after the set operation
		const prop_type = this.property_type(node.type, property_key_str);
		/** @type {NodeId[]} */
		let removed_node_ids = [];

		if (prop_type === 'node' && typeof previous_value === 'string' && previous_value !== value) {
			removed_node_ids = [previous_value];
		} else if (
			prop_type === 'node_array' &&
			Array.isArray(previous_value) &&
			Array.isArray(value)
		) {
			// Only include node IDs that were in previous_value but are not in the new value
			removed_node_ids = previous_value.filter((id) => !value.includes(id));
		}

		const op = ['set', normalized_path, value];
		this.ops.push(op);
		this.inverse_ops.push(['set', normalized_path, previous_value]);
		this._apply_op(op);

		for (const removed_node_id of removed_node_ids) {
			// NOTE: This implicitly deletes childnodes as well, given that they are no longer referenced.
			this.delete(removed_node_id);
		}

		return this;
	}

	// Takes a subgraph and constructs new nodes from it
	// NOTE: all ids will be mapped to new unique ids.
	// NOTE: Omitted properties will be populated with default values.
	build(node_id, nodes) {
		const depth_first_nodes = traverse(node_id, this.schema, nodes);
		// This maps original ids to newly generated ids
		const id_map = {};

		for (const node of depth_first_nodes) {
			const new_id = this.generate_id();
			id_map[node.id] = new_id;
			const new_node = { ...node, id: new_id };
			const node_schema = this.schema[node.type];

			// Update all property references to use new IDs
			for (const [property_name, property_definition] of Object.entries(node_schema.properties)) {
				const prop_type = property_definition.type;
				const value = node[property_name];

				// Apply default values
				if (prop_type === 'node_array') {
					// [] is the default value for node arrays
					new_node[property_name] = Array.isArray(value)
						? value.map((ref_id) => id_map[ref_id])
						: [];
				} else if (prop_type === 'node') {
					// null is the default value for node references
					new_node[property_name] = typeof value === 'string' ? id_map[value] : null;
				} else if (prop_type === 'annotated_text') {
					if (value) {
						const annotations = value.annotations.map((annotation) => {
							const { start_offset, end_offset, node_id } = annotation;
							return { start_offset, end_offset, node_id: id_map[node_id] || node_id };
						});
						new_node[property_name] = { text: value.text, annotations };
					} else {
						new_node[property_name] = { text: '', annotations: [] };
					}
				} else if (prop_type === 'string') {
					new_node[property_name] = value ?? property_definition.default ?? '';
				} else if (prop_type === 'integer') {
					new_node[property_name] = value ?? property_definition.default ?? 0;
				} else if (prop_type === 'number') {
					new_node[property_name] = value ?? property_definition.default ?? 0;
				} else if (prop_type === 'boolean') {
					new_node[property_name] = value ?? property_definition.default ?? false;
				} else if (['integer_array', 'number_array'].includes(prop_type)) {
					new_node[property_name] = value ?? property_definition.default ?? [];
				} else if (prop_type === 'string_array') {
					new_node[property_name] = value ?? property_definition.default ?? [];
				}
			}

			this.create(new_node);
		}

		return id_map[depth_first_nodes.at(-1).id];
	}

	/**
	 * Creates a new node in the document.
	 *
	 * The node must have a valid id and must not already exist in the document.
	 * The node is validated against the document schema before creation.
	 *
	 * @param {any} node - The node object to create (must include id, type, and other properties)
	 * @returns {Transaction} This transaction instance for method chaining
	 * @throws {Error} If the node ID is invalid or if the node already exists
	 *
	 * @example
	 * ```js
	 * tr.create({
	 *   id: 'para_123',
	 *   type: 'paragraph',
	 *   content: ['Hello world', []]
	 * });
	 * ```
	 */
	create(node) {
		// Validate node against schema
		this.validate_node(node);

		if (this.get(node.id)) {
			throw new Error('Node with id ' + node.id + ' already exists');
		}

		const op = ['create', node];
		this.ops.push(op);
		this.inverse_ops.push(['delete', node.id]);
		this._apply_op(op);
		return this;
	}

	/**
	 * Deletes a node from the document by its ID.
	 *
	 * The node's current state is captured for undo support before deletion.
	 *
	 * @param {any} id - The ID of the node to delete
	 * @returns {Transaction} This transaction instance for method chaining
	 *
	 * @example
	 * ```js
	 * tr.delete('node_123');
	 * ```
	 */
	delete(id) {
		const previous_value = this.get(id);
		if (!previous_value) {
			console.warn(`Deletion of node ${id} skipped, as it does not exist.`);
		}
		// Get nodes referenced by this node BEFORE deleting it.
		const referenced_nodes = this.get_referenced_nodes(id);
		const op = ['delete', id];
		this.ops.push(op);
		this.inverse_ops.push(['create', previous_value]);
		this._apply_op(op);
		// Check if the nodes that were referenced by the deleted node are now orphaned
		// NOTE: We don't do this yet, because we still have some manual child node removal code
		// that causes errors. But we should soon implement this only here.
		this._cascade_delete_unreferenced_nodes(referenced_nodes);
		return this;
	}

	/**
	 * Sets the document selection.
	 *
	 * @param {Selection} selection - The new selection object
	 * @returns {Transaction} This transaction instance for method chaining
	 * @throws {Error} Throws if the selection is invalid or out of bounds
	 */
	set_selection(selection) {
		this._validate_selection(selection);
		this.selection = selection;
		return this;
	}

	/**
	 * Validates a selection against the current document state.
	 *
	 * @param {Selection} selection - The selection to validate
	 * @throws {Error} Throws if the selection is invalid
	 * @private
	 */
	_validate_selection(selection) {
		if (!selection) return;

		const selection_type = selection.type;
		if (!['node', 'text', 'property'].includes(selection_type)) {
			throw new Error(`Invalid selection type: ${selection_type}`);
		}

		if (selection_type === 'node') {
			const node_array = this.get(selection.path);

			if (!Array.isArray(node_array)) {
				throw new Error('Node selection path must point to a node_array');
			}

			const max_offset = node_array.length;
			if (selection.anchor_offset < 0 || selection.anchor_offset > max_offset) {
				throw new Error(
					`Node selection anchor_offset (${selection.anchor_offset}) is out of bounds. Max is ${max_offset}.`
				);
			}
			if (selection.focus_offset < 0 || selection.focus_offset > max_offset) {
				throw new Error(
					`Node selection focus_offset (${selection.focus_offset}) is out of bounds. Max is ${max_offset}.`
				);
			}
		} else if (selection_type === 'text') {
			const annotated_text = this.get(selection.path);

			if (!annotated_text || typeof annotated_text.text !== 'string') {
				throw new Error('Text selection path must point to annotated_text');
			}

			const char_length = get_char_length(annotated_text.text);
			if (selection.anchor_offset < 0 || selection.anchor_offset > char_length) {
				throw new Error(
					`Text selection anchor_offset (${selection.anchor_offset}) is out of bounds. Max is ${char_length}.`
				);
			}
			if (selection.focus_offset < 0 || selection.focus_offset > char_length) {
				throw new Error(
					`Text selection focus_offset (${selection.focus_offset}) is out of bounds. Max is ${char_length}.`
				);
			}
		}
	}

	/**
	 * Adds, updates, or removes text annotations in the current selection.
	 *
	 * Handles various annotation scenarios including adding new annotations,
	 * updating existing ones (especially for links), and removing annotations
	 * when conflicting types are applied.
	 *
	 * @param {any} annotation_type - The type of annotation (e.g., 'link', 'bold', 'italic')
	 * @param {any} annotation_properties - Additional data for the annotation (e.g., href for links)
	 * @returns {Transaction} This transaction instance for method chaining
	 *
	 * @example
	 * ```js
	 * // Add a link annotation
	 * tr.annotate_text('link', { href: 'https://example.com' });
	 *
	 * // Add emphasis
	 * tr.annotate_text('emphasis', {});
	 * ```
	 */
	annotate_text(annotation_type, annotation_properties) {
		if (this.selection.type !== 'text') return this;

		const { start, end } = get_selection_range(this.selection);
		const annotated_text = structuredClone($state.snapshot(this.get(this.selection.path)));
		const annotations = annotated_text.annotations;
		const existing_annotation = this.active_annotation();
		const existing_annotation_same_type = this.active_annotation(annotation_type);

		if (existing_annotation) {
			// If there's an existing annotation of the same type, remove it
			if (existing_annotation_same_type) {
				const index = annotations.findIndex(
					/** @param {any} anno */ (anno) =>
						anno.start_offset === existing_annotation.start_offset &&
						anno.end_offset === existing_annotation.end_offset
				);
				if (index !== -1) {
					// Remove the annotation node from the graph
					this.delete(annotations[index].node_id);
					annotations.splice(index, 1);
				}
			} else {
				// If there's an annotation of a different type, don't add a new one
				return this;
			}
		} else {
			if (is_selection_collapsed(this.selection)) {
				console.log('Annotations can only be added to expanded text selections.');
				return this;
			}
			if (!this.available_annotation_types.includes(annotation_type)) {
				console.log(`Annotation type ${annotation_type} is not allowed here.`);
				return this;
			}
			const new_annotation_node = {
				id: this.generate_id(),
				type: annotation_type,
				...annotation_properties
			};
			this.create(new_annotation_node);
			// If there's no existing annotation, add the new one
			annotations.push({ start_offset: start, end_offset: end, node_id: new_annotation_node.id });
		}

		// Update the annotated text
		this.set(this.selection.path, annotated_text);
		return this;
	}

	/**
	 * Deletes the currently selected text or nodes.
	 *
	 * Behavior depends on selection type:
	 * - For node selections: Removes selected nodes and cascades deletion of unreferenced nodes
	 * - For text selections: Removes selected text and adjusts annotations accordingly
	 * - For collapsed selections: Deletes the previous character/node (backward) or next character/node (forward)
	 * - Property selections are ignored: Those are best handled handled via commands + keyboard shortcuts.
	 *
	 * @param {'backward' | 'forward'} [direction] - Direction of deletion for collapsed selections
	 * @returns {Transaction} This transaction instance for method chaining
	 */
	delete_selection(direction = 'backward') {
		if (!this.selection || this.selection.type === 'property') return this;
		const path = this.selection.path;

		// Get the start and end indices for the selection
		let start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
		let end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
		let length;

		if (this.selection?.type === 'text') {
			const text_content = this.get(this.selection.path).text;
			length = get_char_length(text_content);
		} else if (this.selection?.type === 'node') {
			const node_array = this.get(this.selection.path);
			length = node_array.length;
		}

		// If selection is collapsed we delete the previous char/node (backward)
		// or the next char/node (forward)
		if (start === end) {
			if (direction === 'backward' && start > 0) {
				start = start - 1;
			} else if (direction === 'forward' && end < length) {
				end = end + 1;
			} else if (direction === 'backward' && start === 0) {
				join_text_node(this);
				return this;
			} else if (direction === 'forward' && end === length) {
				// At end of text - try to join with next text node
				const node_index = parseInt(String(this.selection.path.at(-2)), 10);
				const successor_node = this.get([...this.selection.path.slice(0, -2), node_index + 1]);
				// Check if next node is a text node
				if (successor_node && this.kind(successor_node) === 'text') {
					// Set selection to beginning of next text node
					this.set_selection({
						type: 'text',
						path: [...this.selection.path.slice(0, -2), node_index + 1, 'content'],
						anchor_offset: 0,
						focus_offset: 0
					});
					// Use join_text_node to merge with previous node
					join_text_node(this);
				}
				return this;
			}
		}

		if (this.selection.type === 'node') {
			const node_array = [...this.get(path)];

			// Remove the selected nodes from the node_array
			node_array.splice(start, end - start);

			// Update the node_array in the entry (this implicitly records an op via this.set)
			// Note: this.set() will automatically cascade delete unreferenced nodes
			this.set(path, node_array);

			// Update the selection to point to the start of the deleted range
			this.selection = {
				type: 'node',
				path,
				anchor_offset: start,
				focus_offset: start
			};
		} else if (this.selection.type === 'text') {
			const path = this.selection.path;
			let text = structuredClone($state.snapshot(this.get(path)));

			// Update the text content using character-based operations
			const original_text = text.text;
			text.text =
				char_slice(original_text, 0, start) +
				char_slice(original_text, end, get_char_length(original_text));

			// To mark annotation nodes for deletion.
			/** @type {string[]} */
			const _deleted_nodes = [];
			const deletion_length = end - start;
			const new_annotations = text.annotations
				.map((/** @type {any} */ annotation) => {
					const annotation_start = annotation.start_offset;
					const annotation_end = annotation.end_offset;
					const node_id = annotation.node_id;

					// Case 1: Annotation is entirely before the deleted range - keep unchanged
					if (annotation_end <= start) {
						return annotation;
					}

					// Case 2: Annotation is entirely after the deleted range - shift it
					let new_start = annotation_start;
					if (annotation_start >= end) {
						new_start = annotation_start - deletion_length;
					} else if (annotation_start > start) {
						// Annotation starts inside deleted range
						new_start = start;
					}

					// Case 3: Annotation overlaps with deleted range - adjust end
					let new_end = annotation_end;
					if (annotation_end >= end) {
						new_end = annotation_end - deletion_length;
					} else if (annotation_end > start) {
						// Annotation ends inside deleted range
						new_end = start;
					}

					// If annotation is now empty, mark for deletion
					if (new_start >= new_end) {
						_deleted_nodes.push(node_id);
						return null;
					}

					return { start_offset: new_start, end_offset: new_end, node_id };
				})
				.filter(Boolean);

			text.annotations = new_annotations;

			// Delete marked annotation nodes
			for (const node_id of _deleted_nodes) {
				this.delete(node_id);
			}

			this.set(path, text);

			// Update the selection to the new caret position
			this.selection = {
				type: 'text',
				path,
				anchor_offset: start,
				focus_offset: start
			};
		}

		return this;
	}

	/**
	 * Inserts nodes at the current node selection position.
	 *
	 * If the selection is expanded (not collapsed), first deletes the selected nodes
	 * before inserting the new ones.
	 *
	 * @param {NodeId[]} node_ids - Array of node IDs to insert
	 * @returns {Transaction} This transaction instance for method chaining
	 */
	insert_nodes(node_ids) {
		if (this.selection.type !== 'node') return this;

		// Unless cursor is collapsed, delete the selected nodes as a first step
		if (this.selection.anchor_offset !== this.selection.focus_offset) {
			this.delete_selection();
		}

		const path = this.selection.path;
		const node_array = [...this.get(path)];

		// Get the start and end indices for the selection
		let start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
		let end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);

		if (start !== end) {
			// Remove the selected nodes from the node_array
			node_array.splice(start, end - start);
		}

		// Insert the new nodes
		node_array.splice(start, 0, ...node_ids);

		this.set(path, node_array);

		this.selection = {
			type: 'node',
			path: [...this.selection.path],
			anchor_offset: start,
			focus_offset: start + node_ids.length
		};

		return this;
	}

	/**
	 * Inserts text at the current text selection position.
	 *
	 * Handles annotation adjustments when text is inserted, including:
	 * - Expanding annotations that contain the insertion point
	 * - Shifting annotations that come after the insertion point
	 * - Optionally applying new annotations to the inserted text
	 *
	 * @param {string} replaced_text - The text to insert
	 * @param {Array} [annotations] - Optional annotations to apply to the inserted text
	 * @param {object} [nodes] - Optional node definitions for annotation nodes
	 * @returns {Transaction} This transaction instance for method chaining
	 */
	insert_text(replaced_text, annotations = [], nodes = {}) {
		if (this.selection?.type !== 'text') return this;

		// Unless selection is collapsed, delete the selected content
		// NOTE: This makes sure wrapped annotations are disposed correctly
		if (!is_selection_collapsed(this.selection)) {
			this.delete_selection();
		}

		const annotated_text = structuredClone($state.snapshot(this.get(this.selection.path)));
		const { start, end } = get_selection_range(this.selection);

		// Transform the plain text string using character-based operations
		const text = annotated_text.text;
		annotated_text.text = char_slice(text, 0, start) + replaced_text + char_slice(text, end);

		// Calculate the change in length
		const delta = get_char_length(replaced_text);

		const new_annotations = annotated_text.annotations.map((/** @type {any} */ annotation) => {
			const annotation_start = annotation.start_offset;
			const annotation_end = annotation.end_offset;
			const node_id = annotation.node_id;

			// Annotation is entirely before the insertion point
			if (annotation_end <= start) {
				return annotation;
			}

			// Annotation starts at the insertion point - extend it
			if (annotation_start <= start && annotation_end >= start) {
				return {
					start_offset: annotation_start,
					end_offset: annotation_end + delta,
					node_id
				};
			}

			// Annotation is entirely after the insertion point - shift it
			if (annotation_start >= start) {
				return {
					start_offset: annotation_start + delta,
					end_offset: annotation_end + delta,
					node_id
				};
			}

			// Insertion point is inside the annotation - extend the annotation
			if (annotation_start < start && annotation_end > start) {
				return {
					start_offset: annotation_start,
					end_offset: annotation_end + delta,
					node_id
				};
			}

			return annotation;
		});

		annotated_text.annotations = new_annotations;
		this.set(this.selection.path, annotated_text); // this will update the current state and create a history entry

		// Setting the selection automatically triggers a re-render of the corresponding DOMSelection.
		/** @type {Selection} */
		const new_selection = {
			type: /** @type {const} */ ('text'),
			path: this.selection.path,
			anchor_offset: start + get_char_length(replaced_text),
			focus_offset: start + get_char_length(replaced_text)
		};
		this.selection = new_selection;

		// Now we apply annotations if there are any, but only if there's no active annotation
		// at the current collapsed cursor
		if (!this.active_annotation() && annotations.length > 0) {
			const new_annotations = annotations
				.map((annotation) => {
					const original_annotation_node = nodes[annotation.node_id];
					const text_property_definition = this.inspect(this.selection.path);
					// console.log('original_annotation_node.type', original_annotation_node.type);
					// console.log('text_property_definition', text_property_definition);
					if (text_property_definition.node_types.includes(original_annotation_node.type)) {
						const new_annotation_node_id = this.build(annotation.node_id, nodes);
						return {
							start_offset: start + annotation.start_offset,
							end_offset: start + annotation.end_offset,
							node_id: new_annotation_node_id
						};
					}
					return null;
				})
				.filter(Boolean);
			const next_annotated_text = structuredClone(annotated_text);
			next_annotated_text.annotations = next_annotated_text.annotations.concat(new_annotations);
			this.set(this.selection.path, next_annotated_text); // this will update the current state and create a history entry
		}

		return this;
	}

	/**
	 * Recursively deletes nodes that are no longer referenced in the document.
	 *
	 * This handles the cascade deletion of child nodes when their parent
	 * references are removed. Uses reference counting to determine which
	 * nodes are safe to delete.
	 *
	 * @param {NodeId[]} potentially_orphaned_nodes - Array of node IDs to check
	 * @private
	 */
	_cascade_delete_unreferenced_nodes(potentially_orphaned_nodes) {
		/** @type {Record<NodeId, boolean>} */
		const nodes_to_delete = {};
		const to_check = [...potentially_orphaned_nodes];

		while (to_check.length > 0) {
			const node_id = to_check.pop();
			if (!node_id || nodes_to_delete[node_id]) continue;

			// Count references to this node, excluding nodes already marked for deletion
			const ref_count = this._count_references_excluding_deleted(node_id, nodes_to_delete);

			if (ref_count === 0) {
				// No more references, safe to delete this node
				nodes_to_delete[node_id] = true;

				// Also check all nodes referenced by this node
				const referenced_nodes = this.get_referenced_nodes(node_id);
				to_check.push(...referenced_nodes);
			}
		}

		// Now perform the actual deletions
		for (const node_id of Object.keys(nodes_to_delete)) {
			const previous_value = this.get([node_id]);
			if (previous_value) {
				const op = ['delete', node_id];
				this.ops.push(op);
				this.inverse_ops.push(['create', previous_value]);
				this._apply_op(op);
			}
		}
	}

	/**
	 * Counts references to a node, excluding nodes that have been marked for deletion.
	 *
	 * This is used during cascade deletion to accurately count remaining references
	 * as nodes are being deleted.
	 *
	 * @param {NodeId} target_node_id - The node ID to count references for
	 * @param {Record<NodeId, boolean>} nodes_to_delete - Nodes already marked for deletion
	 * @returns {number} The number of references to the target node
	 * @private
	 */
	_count_references_excluding_deleted(target_node_id, nodes_to_delete) {
		return count_references_excluding_deleted(
			this.schema,
			this.doc,
			target_node_id,
			nodes_to_delete
		);
	}
}
