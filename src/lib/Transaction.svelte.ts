import {
	get_char_length,
	char_slice,
	traverse,
	traverse_ids,
	get_selection_range,
	is_selection_collapsed,
	adjust_ranges_for_deletion,
	adjust_ranges_for_insertion,
	are_ranges_exclusive
} from './utils.js';
import { join_text_node } from './transforms.svelte.js';
import {
	get as doc_get,
	property_type as doc_property_type,
	kind as doc_kind,
	inspect as doc_inspect,
	create_document_draft,
	apply_op_to_draft,
	splice_annotated_text,
	build_reference_counts,
	visit_node_references,
	validate_node,
	is_id_valid,
	fill_node_defaults,
	can_switch_mark_type,
	get_selected_marks,
	get_selected_annotations,
	get_selected_range_types,
	validate_selection
} from './doc_utils.js';
import type { SelectedAttachment } from './doc_utils.js';
import type {
	NodeId,
	NodeKind,
	Selection,
	Document,
	DocumentSchema,
	DocumentNode,
	DocumentPath,
	Attachment,
	Mark,
	Annotation,
	Text,
	DocumentOperation,
	DynamicRecord,
	Inspection,
	SessionConfig
} from './types.js';

/**
 * Check whether a selection-relative range fits within a container length.
 */
function is_range_within_bounds(range: Attachment, length: number): boolean {
	return (
		Number.isInteger(range.start_offset) &&
		Number.isInteger(range.end_offset) &&
		range.start_offset >= 0 &&
		range.start_offset < range.end_offset &&
		range.end_offset <= length
	);
}

/**
 * Compares two range arrays (marks or annotations) for exact equality.
 */
function ranges_equal(a: Array<Attachment>, b: Array<Attachment>): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (
			a[i].start_offset !== b[i].start_offset ||
			a[i].end_offset !== b[i].end_offset ||
			a[i].node_id !== b[i].node_id
		) {
			return false;
		}
	}
	return true;
}

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
	schema: DocumentSchema;
	doc: Document;
	// NOTE: Typed non-null for historical reasons — most methods assume a
	// selection is present. A null selection is cast here and would surface at
	// runtime exactly as before the TypeScript conversion.
	selection: Selection;
	config: SessionConfig;
	ops: DocumentOperation[];
	inverse_ops: DocumentOperation[];
	selection_before: Selection | null;
	created_node_ids: NodeId[];
	modified_node_ids: NodeId[];
	deleted_node_ids: NodeId[];
	changed_node_types: boolean;

	/**
	 * Creates a new Transaction with the given state.
	 *
	 * @param schema - The document schema
	 * @param doc - The document state {document_id, nodes}
	 * @param selection - The current selection
	 * @param config - The document config (including generate_id)
	 */
	constructor(
		schema: DocumentSchema,
		doc: Document,
		selection: Selection | null,
		config: SessionConfig
	) {
		this.schema = schema;
		// The transaction works on a draft: one shallow copy of the nodes map
		// up front, then ops mutate the draft in place (copying node objects
		// on write). This keeps the original document untouched and node
		// identity stable for unchanged nodes, without the previous
		// one-full-map-copy-per-op cost.
		this.doc = create_document_draft(doc);
		this.selection = selection as Selection;
		this.config = config;
		// Here we track the ops during the transaction
		this.ops = [];
		this.inverse_ops = [];
		// Remember the selection before the transaction started
		this.selection_before = selection;

		this.created_node_ids = [];
		this.modified_node_ids = [];
		this.deleted_node_ids = [];
		// True when any op set a node's 'type' property — referrers must be
		// re-validated against type constraints in that case.
		this.changed_node_types = false;
	}

	/**
	 * Gets a value from the document at the specified path.
	 *
	 * @param path - The path to the value in the document, or a string node ID
	 * @returns The value at the specified path
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	get(path: DocumentPath | string): any {
		return doc_get(this.schema, this.doc, path);
	}

	/**
	 * Gets the type of a property from the schema.
	 */
	property_type(type: string, property: string): string {
		return doc_property_type(this.schema, type, property);
	}

	/**
	 * Determines the kind of a node ('document', 'block', 'text', 'mark', or 'annotation').
	 */
	kind(node: DocumentNode): NodeKind {
		return doc_kind(this.schema, node);
	}

	/**
	 * Inspects a path to get metadata about the value at that location.
	 */
	inspect(path: DocumentPath): Inspection {
		return doc_inspect(this.schema, this.doc, path);
	}

	/**
	 * Generates a new unique ID using the config's generate_id function.
	 */
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
	 * Validates a node against the document schema.
	 *
	 * @throws {Error} Throws if the node is invalid
	 */
	validate_node(node: DocumentNode): void {
		validate_node(node, this.schema, this.doc.nodes, { require_references: false });
	}

	/**
	 * Gets all nodes referenced by a given node (recursively).
	 */
	get_referenced_nodes(node_id: NodeId): NodeId[] {
		return traverse_ids(node_id, this.schema, this.doc.nodes).slice(0, -1);
	}

	/**
	 * Gets the available mark types for the current selection.
	 */
	get available_mark_types(): string[] {
		if (this.selection?.type !== 'text' && this.selection?.type !== 'node') return [];
		const property_definition = this.inspect(this.selection.path);
		return property_definition.mark_types || [];
	}

	/**
	 * Gets the available annotation types for the current selection.
	 */
	get available_annotation_types(): string[] {
		if (this.selection?.type !== 'text' && this.selection?.type !== 'node') return [];
		const property_definition = this.inspect(this.selection.path);
		return property_definition.annotation_types || [];
	}

	/**
	 * Returns marks touched by the current selection.
	 */
	get selected_marks(): SelectedAttachment[] {
		return get_selected_marks(this.schema, this.doc, this.selection);
	}

	get active_mark(): SelectedAttachment | null {
		return this.selected_marks.length === 1 ? this.selected_marks[0] : null;
	}

	/**
	 * Returns annotations touched by the current selection.
	 */
	get selected_annotations(): SelectedAttachment[] {
		return get_selected_annotations(this.schema, this.doc, this.selection);
	}

	get active_annotation(): SelectedAttachment | null {
		return this.selected_annotations.length === 1 ? this.selected_annotations[0] : null;
	}

	/**
	 * Applies an operation to the document (internal).
	 */
	private _apply_op(op: DocumentOperation): void {
		apply_op_to_draft(this.doc, op);
	}

	private _track_node_id(node_ids: NodeId[], node_id: NodeId): void {
		if (!node_ids.includes(node_id)) node_ids.push(node_id);
	}

	/**
	 * Sets a property of a node to a new value.
	 *
	 * This is the core operation for modifying document properties. It records
	 * both the forward operation and its inverse for undo support.
	 *
	 * @param path - Array path to the property (e.g., ["node_1", "title"])
	 * @param value - The new value to set
	 * @returns This transaction instance for method chaining
	 *
	 * @example
	 * ```js
	 * tr.set(["list_1", "list_items"], [1, 2, 3]);
	 * tr.set(["page_1", "body", "0", "description"], {content: "Hello world", marks: [], annotations: []});
	 * ```
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	set(path: DocumentPath, value: any): this {
		const path_info = this.inspect(path);
		if (path_info?.kind !== 'property') {
			throw new Error(
				`Transaction.set requires a path that points to a property, got ${JSON.stringify(path)}`
			);
		}

		const node = this.get(path.slice(0, -1));

		// Turns ["page_1", "body", "0", "description"]
		// into ["paragraph_1", "description"].
		// Important to keep changes of multiple ops invertible.
		const normalized_path = [node.id, path.at(-1)];

		// Just to be sure, make a deep copy of the old value
		const property_key = path.at(-1);
		const property_key_str = String(property_key);
		const previous_value = structuredClone($state.snapshot(node[property_key_str]));

		// Collect node IDs that might need to be deleted after the set operation
		const prop_type = this.property_type(node.type, property_key_str);
		let removed_node_ids: NodeId[] = [];

		if (prop_type === 'node' && typeof previous_value === 'string' && previous_value !== value) {
			removed_node_ids = [previous_value];
		} else if (prop_type === 'node_array') {
			const previous_node_ids = previous_value.nodes;
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local lookup set.
			const next_node_ids = new Set(value.nodes);

			// Only include node IDs that were in previous_value but are not in the new value
			removed_node_ids = previous_node_ids.filter((id: NodeId) => !next_node_ids.has(id));
		}

		const op: DocumentOperation = ['set', normalized_path, value];
		this.ops.push(op);
		this.inverse_ops.push(['set', normalized_path, previous_value]);
		this._apply_op(op);
		this._track_node_id(this.modified_node_ids, node.id);
		if (property_key_str === 'type') this.changed_node_types = true;

		// Garbage-collect nodes whose only reference was via this property.
		// We must use a ref-count-aware sweep instead of unconditional deletion
		// because a node ID removed from this array may still be referenced
		// elsewhere — either from a pre-existing reference (e.g. shared nodes)
		// or from a node created earlier in the same transaction (the
		// wrap-in-group pattern: create a wrapper that points at the children,
		// then set the parent array to drop them).
		if (removed_node_ids.length > 0) {
			this._cascade_delete_unreferenced_nodes(removed_node_ids);
		}

		return this;
	}

	/**
	 * Splices a text property: deletes delete_count characters at start,
	 * then inserts text at start. Mark and annotation ranges are adjusted
	 * deterministically as part of applying the op (see splice_annotated_text
	 * in doc_utils.ts), and mark/annotation nodes whose range collapsed away
	 * are garbage-collected ref-count-aware, like set() does.
	 *
	 * Offsets are in characters (grapheme clusters, as segmented by
	 * Intl.Segmenter — the same unit as all svedit text offsets, see
	 * get_char_length in utils.ts).
	 *
	 * The recorded op is small — [start, delete_count, text] instead of a
	 * copy of the whole property value — which keeps long editing sessions
	 * flat in memory and makes the op stream meaningful (diffs, previews,
	 * persistence). The inverse is a plain splice when re-splicing the
	 * deleted text restores the prior ranges exactly; deletions that removed
	 * or truncated ranges are lossy, so their inverse carries the prior
	 * ranges verbatim.
	 *
	 * @param path - Path to a text property
	 * @param start - Character offset to splice at
	 * @param delete_count - Number of characters to delete
	 * @param text - Text to insert at start ('' for pure deletion)
	 * @returns This transaction instance for method chaining
	 * @throws {Error} If the path is not a text property or the range is out of bounds
	 *
	 * @example
	 * ```js
	 * tr.splice(['paragraph_1', 'content'], 5, 0, 'Hello'); // insert
	 * tr.splice(['paragraph_1', 'content'], 5, 5, '');      // delete
	 * tr.splice(['paragraph_1', 'content'], 5, 5, 'Hello'); // replace
	 * ```
	 */
	splice(path: DocumentPath, start: number, delete_count: number, text: string): this {
		const path_info = this.inspect(path);
		if (path_info?.kind !== 'property' || path_info.type !== 'text') {
			throw new Error(
				`Transaction.splice requires a path that points to a text property, got ${JSON.stringify(path)}`
			);
		}

		const node = this.get(path.slice(0, -1));
		const property_key_str = String(path.at(-1));
		const normalized_path = [node.id, property_key_str];

		const content_length = get_char_length(node[property_key_str].content);
		if (
			!Number.isInteger(start) ||
			!Number.isInteger(delete_count) ||
			start < 0 ||
			delete_count < 0 ||
			start + delete_count > content_length
		) {
			throw new Error(
				`Splice range [${start}, ${start + delete_count}) is out of bounds for content of length ${content_length}`
			);
		}

		const op: DocumentOperation = ['splice', normalized_path, start, delete_count, text];

		// Pure insertions (every keystroke) take a fast path: insertion
		// adjustment never removes or truncates ranges, so the inverse is a
		// plain splice by construction and no value copies or round-trip
		// checks are needed.
		if (delete_count === 0) {
			this.ops.push(op);
			this.inverse_ops.push(['splice', normalized_path, start, get_char_length(text), '']);
			this._apply_op(op);
			this._track_node_id(this.modified_node_ids, node.id);
			return this;
		}

		const previous_value: Text = structuredClone($state.snapshot(node[property_key_str]));
		const deleted_text = char_slice(previous_value.content, start, start + delete_count);
		const insert_length = get_char_length(text);

		const { value: next_value, removed_node_ids } = splice_annotated_text(
			previous_value,
			start,
			delete_count,
			text
		);

		// The inverse can be a plain splice only when re-splicing the deleted
		// text back restores the prior ranges exactly (round-trip check).
		const { value: round_trip } = splice_annotated_text(
			next_value,
			start,
			insert_length,
			deleted_text
		);
		const lossless =
			ranges_equal(round_trip.marks, previous_value.marks) &&
			ranges_equal(round_trip.annotations, previous_value.annotations);

		const inverse_op: DocumentOperation = lossless
			? ['splice', normalized_path, start, insert_length, deleted_text]
			: [
					'splice',
					normalized_path,
					start,
					insert_length,
					deleted_text,
					{ marks: previous_value.marks, annotations: previous_value.annotations }
				];

		this.ops.push(op);
		this.inverse_ops.push(inverse_op);
		this._apply_op(op);
		this._track_node_id(this.modified_node_ids, node.id);

		if (removed_node_ids.length > 0) {
			this._cascade_delete_unreferenced_nodes(removed_node_ids);
		}

		return this;
	}

	// Takes a subgraph and constructs new nodes from it
	// NOTE: all ids will be mapped to new unique ids.
	// NOTE: Omitted properties will be populated with default values.
	build(node_id: NodeId, nodes: Record<string, DocumentNode>): NodeId {
		const depth_first_nodes = traverse(node_id, this.schema, nodes);
		// This maps original ids to newly generated ids
		const id_map: Record<string, string> = {};

		for (const node of depth_first_nodes) {
			const new_id = this.generate_id();
			id_map[node.id] = new_id;
			let new_node: DocumentNode = { ...node, id: new_id };
			const node_schema = this.schema[node.type];

			// Update all property references to use new IDs
			for (const [property_name, property_definition] of Object.entries(node_schema.properties)) {
				const prop_type = property_definition.type;
				const value = new_node[property_name];

				const remap_ranges = (ranges: Attachment[] | undefined) =>
					(ranges ?? []).map(({ start_offset, end_offset, node_id }) => {
						return { start_offset, end_offset, node_id: id_map[node_id] || node_id };
					});

				if (prop_type === 'node_array' && value && typeof value === 'object') {
					new_node[property_name] = {
						nodes: value.nodes.map((ref_id: NodeId) => id_map[ref_id]),
						marks: remap_ranges(value.marks),
						annotations: remap_ranges(value.annotations)
					};
				} else if (prop_type === 'node' && typeof value === 'string') {
					new_node[property_name] = id_map[value];
				} else if (prop_type === 'text' && value) {
					new_node[property_name] = {
						content: value.content,
						marks: remap_ranges(value.marks),
						annotations: remap_ranges(value.annotations)
					};
				}
			}

			new_node = fill_node_defaults(new_node, this.schema);
			this.create(new_node);
		}

		return id_map[depth_first_nodes.at(-1)!.id];
	}

	/**
	 * Creates a new node in the document.
	 *
	 * The node must have a valid id and must not already exist in the document.
	 * Omitted properties with schema defaults are filled before validation.
	 *
	 * @param node - The node object to create (must include id, type, and required properties)
	 * @returns This transaction instance for method chaining
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
	create(node: DocumentNode): this {
		const node_with_defaults = fill_node_defaults(node, this.schema);

		// Validate node against schema
		this.validate_node(node_with_defaults);

		if (this.get(node_with_defaults.id)) {
			throw new Error('Node with id ' + node_with_defaults.id + ' already exists');
		}

		const op: DocumentOperation = ['create', node_with_defaults];
		this.ops.push(op);
		this.inverse_ops.push(['delete', node_with_defaults.id]);
		this._apply_op(op);
		this._track_node_id(this.created_node_ids, node_with_defaults.id);
		return this;
	}

	/**
	 * Deletes a node from the document by its ID.
	 *
	 * The node's current state is captured for undo support before deletion.
	 *
	 * NOTE: This is a force-delete and intentionally does NOT check whether
	 * the node is still referenced from elsewhere — callers (e.g.
	 * `toggle_mark`) sometimes need to remove a node while a stale
	 * reference to it still exists in the property they are about to update.
	 * For ref-count-aware cleanup, see how `set` calls
	 * `_cascade_delete_unreferenced_nodes`.
	 *
	 * @param id - The ID of the node to delete
	 * @returns This transaction instance for method chaining
	 *
	 * @example
	 * ```js
	 * tr.delete('node_123');
	 * ```
	 */
	delete(id: NodeId): this {
		const previous_value = this.get(id);
		if (!previous_value) {
			console.warn(`Deletion of node ${id} skipped, as it does not exist.`);
			return this;
		}
		// Get nodes referenced by this node BEFORE deleting it.
		const referenced_nodes = this.get_referenced_nodes(id);
		const op: DocumentOperation = ['delete', id];
		this.ops.push(op);
		this.inverse_ops.push(['create', previous_value]);
		this._apply_op(op);
		this._track_node_id(this.deleted_node_ids, id);
		// Cascade delete any nodes that are now orphaned after removing this node
		this._cascade_delete_unreferenced_nodes(referenced_nodes);
		return this;
	}

	/**
	 * Sets the document selection.
	 *
	 * @param selection - The new selection object
	 * @returns This transaction instance for method chaining
	 * @throws {Error} Throws if the selection is invalid or out of bounds
	 */
	set_selection(selection: Selection): this {
		this._validate_selection(selection);
		this.selection = selection;
		return this;
	}

	/**
	 * Validates a selection against the current document state.
	 *
	 * @throws {Error} Throws if the selection is invalid
	 */
	private _validate_selection(selection: Selection | null): void {
		validate_selection(selection, this);
	}

	/**
	 * Toggles a mark on the current text or node selection.
	 *
	 * Marks are mutually exclusive. Whole marks are toggled, removed, or
	 * switched; ranges are never truncated or expanded by this command.
	 *
	 * @param mark_type - The type of mark (e.g., 'link', 'strong', 'emphasis')
	 * @param mark_properties - Additional data for the mark (e.g., href for links)
	 * @returns This transaction instance for method chaining
	 *
	 * @example
	 * ```js
	 * // Add a link mark
	 * tr.toggle_mark('link', { href: 'https://example.com' });
	 *
	 * // Add emphasis
	 * tr.toggle_mark('emphasis', {});
	 * ```
	 */
	toggle_mark(mark_type: string, mark_properties?: DynamicRecord): this {
		if (this.selection.type !== 'text' && this.selection.type !== 'node') return this;
		if (this.selection.type === 'node' && is_selection_collapsed(this.selection)) return this;
		if (!this.available_mark_types.includes(mark_type)) {
			console.warn(`Mark type ${mark_type} is not allowed here.`);
			return this;
		}

		const range = get_selection_range(this.selection);
		if (!range) return this;

		const annotated_value = structuredClone($state.snapshot(this.get(this.selection.path)));

		// All marks compete for toggling, since marks are mutually exclusive.
		// Annotations never block a mark toggle.
		const selected_marks = this.selected_marks;
		const selected_mark_types = get_selected_range_types(selected_marks);

		if (selected_mark_types.size > 1) return this;

		if (selected_marks.length === 0) {
			if (is_selection_collapsed(this.selection)) {
				return this;
			}
			const new_mark_node = {
				id: this.generate_id(),
				type: mark_type,
				...mark_properties
			};
			this.create(new_mark_node);
			// If there's no existing mark, add the new one
			annotated_value.marks.push({
				start_offset: range.start_offset,
				end_offset: range.end_offset,
				node_id: new_mark_node.id
			});
			this.set(this.selection.path, annotated_value);
			return this;
		}

		const first_selected_mark = selected_marks[0];
		const selected_mark_type = first_selected_mark.node.type;

		if (selected_mark_type === mark_type) {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const selected_indices = new Set(selected_marks.map(({ index }) => index));
			const removed_node_ids = selected_marks.map(({ node_id }) => node_id);
			annotated_value.marks = annotated_value.marks.filter(
				(_: Attachment, index: number) => !selected_indices.has(index)
			);
			this.set(this.selection.path, annotated_value);
			this._cascade_delete_unreferenced_nodes(removed_node_ids);
			return this;
		}

		if (
			selected_marks.length === 1 &&
			can_switch_mark_type(this.schema, selected_mark_type, mark_type)
		) {
			const selected_mark = first_selected_mark;
			this.set([selected_mark.node_id, 'type'], mark_type);
			this.set_selection({
				type: this.selection.type,
				path: this.selection.path,
				anchor_offset: selected_mark.start_offset,
				focus_offset: selected_mark.end_offset
			});
			return this;
		}

		return this;
	}

	/**
	 * Toggles an annotation on the current text or node selection.
	 *
	 * Annotations only compete with touched annotations of the same type:
	 * touched same-type annotations are removed, otherwise a new annotation is
	 * created. Marks and other annotation types never block a toggle, and
	 * same-type annotations may still overlap when created through lower-level
	 * APIs.
	 *
	 * @param annotation_type - The type of annotation (e.g., 'comment', 'marker')
	 * @param annotation_properties - Additional data for the annotation
	 * @returns This transaction instance for method chaining
	 *
	 * @example
	 * ```js
	 * // Add a comment annotation
	 * tr.toggle_annotation('comment', { text: 'Please review' });
	 * ```
	 */
	toggle_annotation(annotation_type: string, annotation_properties?: DynamicRecord): this {
		if (this.selection.type !== 'text' && this.selection.type !== 'node') return this;
		if (this.selection.type === 'node' && is_selection_collapsed(this.selection)) return this;
		if (!this.available_annotation_types.includes(annotation_type)) {
			console.warn(`Annotation type ${annotation_type} is not allowed here.`);
			return this;
		}

		const range = get_selection_range(this.selection);
		if (!range) return this;

		const annotated_value = structuredClone($state.snapshot(this.get(this.selection.path)));

		// Only touched annotations of the same type compete
		const selected_annotations = this.selected_annotations.filter(
			({ node }) => node?.type === annotation_type
		);

		if (selected_annotations.length === 0) {
			if (is_selection_collapsed(this.selection)) {
				return this;
			}
			const new_annotation_node = {
				id: this.generate_id(),
				type: annotation_type,
				...annotation_properties
			};
			this.create(new_annotation_node);
			annotated_value.annotations.push({
				start_offset: range.start_offset,
				end_offset: range.end_offset,
				node_id: new_annotation_node.id
			});
			this.set(this.selection.path, annotated_value);
			return this;
		}

		// Remove touched same-type annotations
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const selected_indices = new Set(selected_annotations.map(({ index }) => index));
		const removed_node_ids = selected_annotations.map(({ node_id }) => node_id);
		annotated_value.annotations = annotated_value.annotations.filter(
			(_: Attachment, index: number) => !selected_indices.has(index)
		);
		this.set(this.selection.path, annotated_value);
		this._cascade_delete_unreferenced_nodes(removed_node_ids);
		return this;
	}

	/**
	 * Deletes the currently selected text, node, or property.
	 *
	 * Behavior depends on selection type:
	 * - For node selections: Removes selected nodes and cascades deletion of unreferenced nodes
	 * - For text selections: Removes selected text and adjusts annotations accordingly
	 * - For collapsed selections: Deletes the previous character/node (backward) or next character/node (forward)
	 * - For property selections: Delegates to the config's handle_property_deletion hook
	 *
	 * @param direction - Direction of deletion for collapsed selections
	 * @returns This transaction instance for method chaining
	 */
	delete_selection(direction: 'backward' | 'forward' = 'backward'): this {
		if (!this.selection) return this;

		if (this.selection.type === 'property') {
			this.config.handle_property_deletion?.(this, this.selection.path);
			return this;
		}

		const path = this.selection.path;

		// Get the start and end indices for the selection
		let start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
		let end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
		let length = 0;

		if (this.selection?.type === 'text') {
			const text_content = this.get(this.selection.path).content;
			length = get_char_length(text_content);
		} else if (this.selection?.type === 'node') {
			const node_array = this.get(this.selection.path);
			length = node_array.nodes.length;
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
				const node_index = this.selection.path.at(-2) as number;
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
			const current_value = structuredClone($state.snapshot(this.get(path)));
			const node_array = [...current_value.nodes];
			const deletion_length = end - start;

			// Remove the selected nodes from the node_array
			node_array.splice(start, deletion_length);
			const marks_result = adjust_ranges_for_deletion(current_value.marks, start, end);
			const annotations_result = adjust_ranges_for_deletion(current_value.annotations, start, end);

			// Update the node_array in the entry (this implicitly records an op via this.set)
			// Note: this.set() will automatically cascade delete unreferenced nodes
			this.set(path, {
				nodes: node_array,
				marks: marks_result.ranges,
				annotations: annotations_result.ranges
			});
			this._cascade_delete_unreferenced_nodes([
				...marks_result.removed_node_ids,
				...annotations_result.removed_node_ids
			]);

			// Update the selection to point to the start of the deleted range
			this.selection = {
				type: 'node',
				path,
				anchor_offset: start,
				focus_offset: start
			};
		} else if (this.selection.type === 'text') {
			const path = this.selection.path;
			// Content change, range adjustment and cleanup of removed
			// mark/annotation nodes all happen in splice().
			this.splice(path, start, end - start, '');

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
	 * @param node_ids - Array of node IDs to insert
	 * @param marks - Selection-relative marks to restore
	 * @param annotations - Selection-relative annotations to restore
	 * @param nodes - Node graph for restored marks and annotations
	 * @returns This transaction instance for method chaining
	 */
	insert_nodes(
		node_ids: NodeId[],
		marks: Array<Mark> = [],
		annotations: Array<Annotation> = [],
		nodes: Record<NodeId, DocumentNode> = {}
	): this {
		if (this.selection.type !== 'node') return this;

		// Unless caret is collapsed, delete the selected nodes as a first step
		if (this.selection.anchor_offset !== this.selection.focus_offset) {
			this.delete_selection();
		}

		const path = this.selection.path;
		const current_value = structuredClone($state.snapshot(this.get(path)));
		const node_array = [...current_value.nodes];

		const start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);

		let next_marks = adjust_ranges_for_insertion(current_value.marks, start, node_ids.length);
		let next_annotations = adjust_ranges_for_insertion(
			current_value.annotations,
			start,
			node_ids.length
		);

		// Insert the new nodes
		node_array.splice(start, 0, ...node_ids);

		this.selection = {
			type: 'node',
			path: [...this.selection.path],
			anchor_offset: start,
			focus_offset: start + node_ids.length
		};

		const property_definition = this.inspect(path);

		// Restore marks only when they stay mutually exclusive
		if (!this.active_mark && marks.length > 0 && are_ranges_exclusive(marks, node_ids.length)) {
			const restored_marks = marks
				.map((mark) => {
					const mark_node = nodes[mark.node_id];
					if (!property_definition.mark_types?.includes(mark_node?.type)) return null;

					const new_mark_node_id = this.build(mark.node_id, nodes);
					return {
						start_offset: start + mark.start_offset,
						end_offset: start + mark.end_offset,
						node_id: new_mark_node_id
					};
				})
				.filter((mark): mark is Attachment => mark !== null);
			const combined_marks = next_marks.concat(restored_marks);
			if (are_ranges_exclusive(combined_marks)) {
				next_marks = combined_marks;
			} else {
				for (const mark of restored_marks) {
					this.delete(mark.node_id);
				}
			}
		}

		// Restore annotations; overlap is allowed
		const restored_annotations = annotations
			.map((annotation) => {
				if (!is_range_within_bounds(annotation, node_ids.length)) return null;
				const annotation_node = nodes[annotation.node_id];
				if (!property_definition.annotation_types?.includes(annotation_node?.type)) return null;

				const new_annotation_node_id = this.build(annotation.node_id, nodes);
				return {
					start_offset: start + annotation.start_offset,
					end_offset: start + annotation.end_offset,
					node_id: new_annotation_node_id
				};
			})
			.filter((annotation): annotation is Attachment => annotation !== null);
		next_annotations = next_annotations.concat(restored_annotations);

		this.set(path, { nodes: node_array, marks: next_marks, annotations: next_annotations });
		return this;
	}

	/**
	 * Inserts text at the current text selection position.
	 *
	 * Handles mark and annotation adjustments when text is inserted, including:
	 * - Expanding ranges that contain the insertion point
	 * - Shifting ranges that come after the insertion point
	 * - Optionally applying new marks and annotations to the inserted text
	 *
	 * @param replaced_text - The text to insert
	 * @param marks - Optional marks to apply to the inserted text
	 * @param annotations - Optional annotations to apply to the inserted text
	 * @param nodes - Optional node definitions for mark and annotation nodes
	 * @returns This transaction instance for method chaining
	 */
	insert_text(
		replaced_text: string,
		marks: Array<Mark> = [],
		annotations: Array<Annotation> = [],
		nodes: Record<NodeId, DocumentNode> = {}
	): this {
		if (this.selection?.type !== 'text') return this;

		// Unless selection is collapsed, delete the selected content
		// NOTE: This makes sure wrapped marks and annotations are disposed correctly
		if (!is_selection_collapsed(this.selection)) {
			this.delete_selection();
		}

		const range = get_selection_range(this.selection)!;
		const delta = get_char_length(replaced_text);

		// One splice op carries the content change and the deterministic
		// mark/annotation range adjustment (see splice()).
		this.splice(this.selection.path, range.start_offset, 0, replaced_text);

		// Setting the selection automatically triggers a re-render of the corresponding DOMSelection.
		const new_selection: Selection = {
			type: 'text',
			path: this.selection.path,
			anchor_offset: range.start_offset + delta,
			focus_offset: range.start_offset + delta
		};
		this.selection = new_selection;

		// Plain typing has no marks/annotations to restore — skip the value
		// copies below on the per-keystroke path.
		if (marks.length === 0 && annotations.length === 0) {
			return this;
		}

		const text_property_definition = this.inspect(this.selection.path);
		// Restored marks/annotations below are applied on top of the
		// post-splice value as a separate set op.
		const text_value: Text = structuredClone($state.snapshot(this.get(this.selection.path)));
		const next_text = structuredClone(text_value);
		let text_changed = false;

		// Now we apply marks if there are any, but only if there's no active mark
		// at the current collapsed caret
		if (!this.active_mark && marks.length > 0 && are_ranges_exclusive(marks, delta)) {
			const restored_marks = marks
				.map((mark) => {
					const original_mark_node = nodes[mark.node_id];
					if (text_property_definition.mark_types?.includes(original_mark_node?.type)) {
						const new_mark_node_id = this.build(mark.node_id, nodes);
						return {
							start_offset: range.start_offset + mark.start_offset,
							end_offset: range.start_offset + mark.end_offset,
							node_id: new_mark_node_id
						};
					}
					return null;
				})
				.filter((mark): mark is Attachment => mark !== null);
			const combined_marks = text_value.marks.concat(restored_marks);
			if (are_ranges_exclusive(combined_marks)) {
				next_text.marks = combined_marks;
				text_changed = true;
			} else {
				for (const mark of restored_marks) {
					this.delete(mark.node_id);
				}
			}
		}

		// Apply annotations to the inserted text; overlap is allowed
		if (annotations.length > 0) {
			const restored_annotations = annotations
				.map((annotation) => {
					if (!is_range_within_bounds(annotation, delta)) return null;
					const original_annotation_node = nodes[annotation.node_id];
					if (text_property_definition.annotation_types?.includes(original_annotation_node?.type)) {
						const new_annotation_node_id = this.build(annotation.node_id, nodes);
						return {
							start_offset: range.start_offset + annotation.start_offset,
							end_offset: range.start_offset + annotation.end_offset,
							node_id: new_annotation_node_id
						};
					}
					return null;
				})
				.filter((annotation): annotation is Attachment => annotation !== null);
			if (restored_annotations.length > 0) {
				next_text.annotations = text_value.annotations.concat(restored_annotations);
				text_changed = true;
			}
		}

		if (text_changed) {
			this.set(this.selection.path, next_text);
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
	 * @param potentially_orphaned_nodes - Array of node IDs to check
	 */
	private _cascade_delete_unreferenced_nodes(potentially_orphaned_nodes: NodeId[]): void {
		if (potentially_orphaned_nodes.length === 0) return;

		// Build reference counts in ONE full-document scan, then maintain them
		// incrementally: marking a node deleted decrements the counts of every
		// node it references (per occurrence). This replaces the previous
		// per-candidate full-document re-scan, which made deleting M nodes
		// O(M·N) instead of O(N + M).
		const ref_counts = build_reference_counts(this.schema, this.doc);

		const nodes_to_delete: Record<NodeId, boolean> = {};
		const to_check = [...potentially_orphaned_nodes];

		while (to_check.length > 0) {
			const node_id = to_check.pop();
			if (!node_id || nodes_to_delete[node_id]) continue;

			if ((ref_counts.get(node_id) || 0) === 0) {
				// No more references, safe to delete this node
				nodes_to_delete[node_id] = true;

				// Release this node's outgoing references and re-check the
				// nodes it pointed at — they may have become unreferenced.
				const node = this.doc.nodes[node_id];
				if (node) {
					visit_node_references(this.schema, node, (referenced_id) => {
						const count = ref_counts.get(referenced_id);
						if (count !== undefined) ref_counts.set(referenced_id, count - 1);
						to_check.push(referenced_id);
					});
				}
			}
		}

		// Now perform the actual deletions
		for (const node_id of Object.keys(nodes_to_delete)) {
			const previous_value = this.get([node_id]);
			if (previous_value) {
				const op: DocumentOperation = ['delete', node_id];
				this.ops.push(op);
				this.inverse_ops.push(['create', previous_value]);
				this._apply_op(op);
				this._track_node_id(this.deleted_node_ids, node_id);
			}
		}
	}
}
