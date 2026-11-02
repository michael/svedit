/* eslint-disable svelte/prefer-svelte-reactivity -- A transaction is plain, non-reactive state */
import {
	get_char_length,
	char_slice,
	traverse,
	traverse_ids,
	get_selection_range,
	is_selection_collapsed,
	adjust_ranges_for_deletion,
	adjust_ranges_for_insertion,
	are_ranges_exclusive,
	for_each_reference
} from './utils.js';
import { join_text_node } from './transforms.svelte.js';
import {
	resolve,
	property_type,
	kind,
	inspect,
	apply_op,
	build_reference_counts,
	validate_node,
	generate_id,
	fill_node_defaults,
	can_switch_mark_type,
	get_selected_attachments,
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
	DocumentOperation,
	DynamicRecord,
	Inspection,
	SessionConfig
} from './types.js';

type AttachmentKey = 'marks' | 'annotations';

/**
 * Groups document operations (create, delete, set) into one atomic,
 * undoable unit. Every operation records its inverse for undo.
 *
 * The transaction works on a draft of the document: the nodes map is copied
 * on the first write and node objects are replaced, never mutated, so the
 * original document stays untouched and unchanged nodes keep their identity.
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
	// Typed non-null: most operations require a selection.
	selection: Selection;
	config: SessionConfig;
	ops: DocumentOperation[] = [];
	inverse_ops: DocumentOperation[] = [];
	selection_before: Selection | null;
	created_node_ids = new Set<NodeId>();
	modified_node_ids = new Set<NodeId>();
	deleted_node_ids = new Set<NodeId>();
	/** True when an op set a node's 'type', so referrers need re-validation. */
	changed_node_types = false;
	#doc: Document;
	#is_draft = false;
	#lookup = (node_id: NodeId) => this.#doc.nodes[node_id];

	constructor(
		schema: DocumentSchema,
		doc: Document,
		selection: Selection | null,
		config: SessionConfig
	) {
		this.schema = schema;
		this.#doc = doc;
		this.selection = selection as Selection;
		this.selection_before = selection;
		this.config = config;
	}

	/** The document state including all operations of this transaction. */
	get doc(): Document {
		return this.#doc;
	}

	/** Gets a value from the document at a path, or a node by id. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	get(path: DocumentPath | string): any {
		return resolve(this.schema, path, this.#lookup);
	}

	property_type(type: string, property: string): string {
		return property_type(this.schema, type, property);
	}

	kind(node: DocumentNode): NodeKind {
		return kind(this.schema, node);
	}

	inspect(path: DocumentPath): Inspection {
		return inspect(this.schema, path, this.#lookup);
	}

	generate_id(): string {
		return generate_id(this.config);
	}

	/** @throws {Error} Throws if the node is invalid */
	validate_node(node: DocumentNode): void {
		validate_node(node, this.schema, this.#doc.nodes, { require_references: false });
	}

	/** All nodes referenced by a node, recursively. */
	get_referenced_nodes(node_id: NodeId): NodeId[] {
		return traverse_ids(node_id, this.schema, this.#doc.nodes).slice(0, -1);
	}

	get available_mark_types(): string[] {
		return this.#allowed_types('mark_types');
	}

	get available_annotation_types(): string[] {
		return this.#allowed_types('annotation_types');
	}

	get selected_marks(): SelectedAttachment[] {
		return this.#selected('marks');
	}

	get active_mark(): SelectedAttachment | null {
		const marks = this.selected_marks;
		return marks.length === 1 ? marks[0] : null;
	}

	get selected_annotations(): SelectedAttachment[] {
		return this.#selected('annotations');
	}

	get active_annotation(): SelectedAttachment | null {
		const annotations = this.selected_annotations;
		return annotations.length === 1 ? annotations[0] : null;
	}

	#allowed_types(key: 'mark_types' | 'annotation_types'): string[] {
		const selection = this.selection;
		if (selection?.type !== 'text' && selection?.type !== 'node') return [];
		return this.inspect(selection.path)[key] || [];
	}

	#selected(key: AttachmentKey): SelectedAttachment[] {
		const selection = this.selection;
		if (selection?.type !== 'text' && selection?.type !== 'node') return [];
		return get_selected_attachments(this.get(selection.path), selection, key, this.#lookup);
	}

	/** Applies an operation to the draft document (internal). */
	_apply_op(op: DocumentOperation): void {
		if (!this.#is_draft) {
			this.#doc = { ...this.#doc, nodes: { ...this.#doc.nodes } };
			this.#is_draft = true;
		}
		apply_op(this.#doc, op, (value) => $state.snapshot(value) as typeof value);
	}

	#record(op: DocumentOperation, inverse_op: DocumentOperation): void {
		this.ops.push(op);
		this.inverse_ops.push(inverse_op);
		this._apply_op(op);
	}

	/**
	 * Sets a property of a node. Nodes that were only referenced through the
	 * replaced value are deleted.
	 *
	 * @example
	 * ```js
	 * tr.set(["page_1", "body", 0, "description"], {content: "Hello world", marks: [], annotations: []});
	 * ```
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	set(path: DocumentPath, value: any): this {
		if (this.inspect(path)?.kind !== 'property') {
			throw new Error(
				`Transaction.set requires a path that points to a property, got ${JSON.stringify(path)}`
			);
		}
		const node = this.get(path.slice(0, -1));
		const property = String(path.at(-1));
		const previous_value = node[property];

		// Ref-count-aware cleanup: a node dropped here may still be referenced
		// elsewhere, e.g. by a wrapper created earlier in this transaction.
		const type = this.property_type(node.type, property);
		let removed_node_ids: NodeId[] = [];
		if (type === 'node' && typeof previous_value === 'string' && previous_value !== value) {
			removed_node_ids = [previous_value];
		} else if (type === 'node_array') {
			const next_ids = new Set(value.nodes);
			removed_node_ids = previous_value.nodes.filter((id: NodeId) => !next_ids.has(id));
		}

		// Normalized to [node_id, property], so ops stay invertible.
		this.#record(['set', [node.id, property], value], ['set', [node.id, property], previous_value]);
		this.modified_node_ids.add(node.id);
		if (property === 'type') this.changed_node_types = true;
		this._cascade_delete_unreferenced_nodes(removed_node_ids);
		return this;
	}

	/**
	 * Creates new nodes from a subgraph and returns the id of the new root.
	 * Ids are regenerated unless preserve_ids is set and no node of the
	 * subgraph exists yet. Repeated attachment occurrences become independent
	 * copies. Omitted properties are filled with defaults.
	 */
	build(
		node_id: NodeId,
		nodes: Record<string, DocumentNode>,
		{ preserve_ids = false }: { preserve_ids?: boolean } = {}
	): NodeId {
		const subgraph = traverse(node_id, this.schema, nodes);
		const keep_ids = preserve_ids && subgraph.every((node) => !this.#doc.nodes[node.id]);
		const id_map: Record<string, string> = {};
		const used_attachment_ids = new Set<NodeId>();
		const remap = (ranges: Attachment[] = []) =>
			ranges.map(({ start_offset, end_offset, node_id }) => {
				const next_id = used_attachment_ids.has(node_id)
					? this.build(node_id, nodes)
					: id_map[node_id] || node_id;
				used_attachment_ids.add(node_id);
				return { start_offset, end_offset, node_id: next_id };
			});

		for (const node of subgraph) {
			const new_node: DocumentNode = {
				...node,
				id: (id_map[node.id] = keep_ids ? node.id : this.generate_id())
			};
			for (const [name, definition] of Object.entries(this.schema[node.type].properties)) {
				const value = new_node[name];
				if (definition.type === 'node_array' && value && typeof value === 'object') {
					new_node[name] = {
						nodes: value.nodes.map((id: NodeId) => id_map[id]),
						marks: remap(value.marks),
						annotations: remap(value.annotations)
					};
				} else if (definition.type === 'node' && typeof value === 'string') {
					new_node[name] = id_map[value];
				} else if (definition.type === 'text' && value) {
					new_node[name] = {
						content: value.content,
						marks: remap(value.marks),
						annotations: remap(value.annotations)
					};
				}
			}
			this.create(new_node);
		}
		return id_map[subgraph.at(-1)!.id];
	}

	/**
	 * Creates a new node. Omitted properties with schema defaults are filled
	 * before validation.
	 *
	 * @throws {Error} If the node id is invalid or the node already exists
	 */
	create(node: DocumentNode): this {
		const new_node = fill_node_defaults(node, this.schema);
		this.validate_node(new_node);
		if (this.get(new_node.id)) throw new Error('Node with id ' + new_node.id + ' already exists');
		this.#record(['create', new_node], ['delete', new_node.id]);
		this.created_node_ids.add(new_node.id);
		return this;
	}

	/**
	 * Deletes a node and every node that becomes unreferenced through it.
	 *
	 * NOTE: This is a force-delete. It does not check whether the node is
	 * still referenced, since callers sometimes remove a node while a stale
	 * reference still exists in a property they are about to update.
	 */
	delete(id: NodeId): this {
		const previous_value = this.get(id);
		if (!previous_value) {
			console.warn(`Deletion of node ${id} skipped, as it does not exist.`);
			return this;
		}
		const referenced_nodes = this.get_referenced_nodes(id);
		this.#record(['delete', id], ['create', previous_value]);
		this.deleted_node_ids.add(id);
		this._cascade_delete_unreferenced_nodes(referenced_nodes);
		return this;
	}

	/** @throws {Error} Throws if the selection is invalid or out of bounds */
	set_selection(selection: Selection): this {
		validate_selection(selection, this);
		this.selection = selection;
		return this;
	}

	#can_attach(types: string[], type: string, label: string): boolean {
		const selection = this.selection;
		if (selection.type !== 'text' && selection.type !== 'node') return false;
		if (selection.type === 'node' && is_selection_collapsed(selection)) return false;
		if (types.includes(type)) return true;
		console.warn(`${label} type ${type} is not allowed here.`);
		return false;
	}

	#add_attachment(key: AttachmentKey, type: string, properties: DynamicRecord | undefined): this {
		if (is_selection_collapsed(this.selection)) return this;
		const { path } = this.selection;
		const value = $state.snapshot(this.get(path));
		const id = this.generate_id();
		this.create({ id, type, ...properties });
		value[key].push({ ...get_selection_range(this.selection), node_id: id });
		return this.set(path, value);
	}

	#remove_attachments(key: AttachmentKey, selected: SelectedAttachment[]): this {
		const { path } = this.selection;
		const value = $state.snapshot(this.get(path));
		const indices = new Set(selected.map(({ index }) => index));
		value[key] = value[key].filter((_: Attachment, index: number) => !indices.has(index));
		this.set(path, value);
		this._cascade_delete_unreferenced_nodes(selected.map(({ node_id }) => node_id));
		return this;
	}

	/**
	 * Toggles a mark on the current text or node selection. Marks are
	 * mutually exclusive: whole marks are added, removed or switched, ranges
	 * are never truncated or expanded.
	 *
	 * @example
	 * ```js
	 * tr.toggle_mark('link', { href: 'https://example.com' });
	 * ```
	 */
	toggle_mark(mark_type: string, mark_properties?: DynamicRecord): this {
		if (!this.#can_attach(this.available_mark_types, mark_type, 'Mark')) return this;
		const selected = this.selected_marks;
		if (get_selected_range_types(selected).size > 1) return this;
		if (selected.length === 0) return this.#add_attachment('marks', mark_type, mark_properties);

		const [mark] = selected;
		if (mark.node.type === mark_type) return this.#remove_attachments('marks', selected);
		if (selected.length === 1 && can_switch_mark_type(this.schema, mark.node.type, mark_type)) {
			this.set([mark.node_id, 'type'], mark_type);
			this.set_selection({
				...this.selection,
				anchor_offset: mark.start_offset,
				focus_offset: mark.end_offset
			} as Selection);
		}
		return this;
	}

	/**
	 * Toggles an annotation on the current text or node selection. Only
	 * touched annotations of the same type compete: they are removed,
	 * otherwise a new annotation is created.
	 *
	 * @example
	 * ```js
	 * tr.toggle_annotation('comment', { text: 'Please review' });
	 * ```
	 */
	toggle_annotation(annotation_type: string, annotation_properties?: DynamicRecord): this {
		if (!this.#can_attach(this.available_annotation_types, annotation_type, 'Annotation'))
			return this;
		const selected = this.selected_annotations.filter(({ node }) => node?.type === annotation_type);
		return selected.length === 0
			? this.#add_attachment('annotations', annotation_type, annotation_properties)
			: this.#remove_attachments('annotations', selected);
	}

	/**
	 * Deletes the selected text, nodes, or property. A collapsed selection
	 * deletes the previous (backward) or next (forward) character or node,
	 * and joins text nodes at their boundaries. Property selections are
	 * delegated to config.handle_property_deletion.
	 */
	delete_selection(direction: 'backward' | 'forward' = 'backward'): this {
		const selection = this.selection;
		if (!selection) return this;
		if (selection.type === 'property') {
			this.config.handle_property_deletion?.(this, selection.path);
			return this;
		}

		const { path, type } = selection;
		const value = this.get(path);
		const length = type === 'text' ? get_char_length(value.content) : value.nodes.length;
		let { start_offset: start, end_offset: end } = get_selection_range(selection)!;

		if (start === end) {
			if (direction === 'backward' && start > 0) {
				start--;
			} else if (direction === 'forward' && end < length) {
				end++;
			} else if (direction === 'backward') {
				join_text_node(this);
				return this;
			} else {
				// At the end of the text, join the next text node into this one
				const successor_path = [...path.slice(0, -2), (path.at(-2) as number) + 1];
				const successor = this.get(successor_path);
				if (successor && this.kind(successor) === 'text') {
					this.set_selection({
						type: 'text',
						path: [...successor_path, 'content'],
						anchor_offset: 0,
						focus_offset: 0
					});
					join_text_node(this);
				}
				return this;
			}
		}

		const marks = adjust_ranges_for_deletion(value.marks, start, end);
		const annotations = adjust_ranges_for_deletion(value.annotations, start, end);
		this.set(path, {
			...value,
			...(type === 'text'
				? { content: char_slice(value.content, 0, start) + char_slice(value.content, end) }
				: { nodes: [...value.nodes.slice(0, start), ...value.nodes.slice(end)] }),
			marks: marks.ranges,
			annotations: annotations.ranges
		});
		this._cascade_delete_unreferenced_nodes([
			...marks.removed_node_ids,
			...annotations.removed_node_ids
		]);
		this.selection = { type, path, anchor_offset: start, focus_offset: start } as Selection;
		return this;
	}

	/**
	 * Copies clipboard marks or annotations onto an inserted range at
	 * `offset`, building their payload nodes from `nodes`.
	 */
	#restore_attachments(
		ranges: Attachment[],
		offset: number,
		length: number,
		allowed_types: string[] | undefined,
		nodes: Record<NodeId, DocumentNode>,
		preserve_ids: boolean
	): Attachment[] {
		return ranges.flatMap((range) => {
			const in_bounds =
				Number.isInteger(range.start_offset) &&
				Number.isInteger(range.end_offset) &&
				range.start_offset >= 0 &&
				range.start_offset < range.end_offset &&
				range.end_offset <= length;
			if (!in_bounds || !allowed_types?.includes(nodes[range.node_id]?.type)) return [];
			return [
				{
					start_offset: offset + range.start_offset,
					end_offset: offset + range.end_offset,
					node_id: this.build(range.node_id, nodes, { preserve_ids })
				}
			];
		});
	}

	/**
	 * Restores clipboard marks onto an inserted range, but only while marks
	 * stay mutually exclusive and no existing mark is active.
	 */
	#restore_marks(
		existing: Mark[],
		marks: Mark[],
		offset: number,
		length: number,
		allowed_types: string[] | undefined,
		nodes: Record<NodeId, DocumentNode>,
		preserve_ids: boolean
	): Mark[] {
		if (this.active_mark || marks.length === 0 || !are_ranges_exclusive(marks, length))
			return existing;
		const restored = this.#restore_attachments(
			marks,
			offset,
			length,
			allowed_types,
			nodes,
			preserve_ids
		);
		const combined = existing.concat(restored);
		if (are_ranges_exclusive(combined)) return combined;
		for (const mark of restored) this.delete(mark.node_id);
		return existing;
	}

	/**
	 * Inserts nodes at the current node selection, replacing selected nodes.
	 * Selection-relative marks and annotations (with their payload nodes) are
	 * restored on the inserted range.
	 */
	insert_nodes(
		node_ids: NodeId[],
		marks: Array<Mark> = [],
		annotations: Array<Annotation> = [],
		nodes: Record<NodeId, DocumentNode> = {},
		{ preserve_ids = false }: { preserve_ids?: boolean } = {}
	): this {
		if (this.selection.type !== 'node') return this;
		if (!is_selection_collapsed(this.selection)) this.delete_selection();

		const path = this.selection.path;
		const value = this.get(path);
		const start = get_selection_range(this.selection)!.start_offset;
		const count = node_ids.length;
		// Selects the inserted range before restoring marks: an existing mark
		// touching that range blocks restoring clipboard marks.
		this.selection = {
			type: 'node',
			path: [...path],
			anchor_offset: start,
			focus_offset: start + count
		};

		const definition = this.inspect(path);
		const next_marks = this.#restore_marks(
			adjust_ranges_for_insertion(value.marks, start, count),
			marks,
			start,
			count,
			definition.mark_types,
			nodes,
			preserve_ids
		);
		const next_annotations = adjust_ranges_for_insertion(value.annotations, start, count).concat(
			this.#restore_attachments(
				annotations,
				start,
				count,
				definition.annotation_types,
				nodes,
				preserve_ids
			)
		);
		const next_nodes = [...value.nodes];
		next_nodes.splice(start, 0, ...node_ids);
		return this.set(path, { nodes: next_nodes, marks: next_marks, annotations: next_annotations });
	}

	/**
	 * Inserts text at the current text selection, replacing selected text.
	 * Ranges containing the insertion point are extended, later ranges
	 * shifted. Optional marks and annotations (relative to the inserted
	 * text, with payload nodes in `nodes`) are applied to the inserted text.
	 */
	insert_text(
		replaced_text: string,
		marks: Array<Mark> = [],
		annotations: Array<Annotation> = [],
		nodes: Record<NodeId, DocumentNode> = {}
	): this {
		if (this.selection?.type !== 'text') return this;
		if (!is_selection_collapsed(this.selection)) this.delete_selection();

		const path = this.selection.path;
		const value = this.get(path);
		const start = get_selection_range(this.selection)!.start_offset;
		const length = get_char_length(replaced_text);
		const text = {
			...value,
			content:
				char_slice(value.content, 0, start) + replaced_text + char_slice(value.content, start),
			marks: adjust_ranges_for_insertion(value.marks, start, length),
			annotations: adjust_ranges_for_insertion(value.annotations, start, length)
		};
		this.set(path, text);
		this.selection = {
			type: 'text',
			path,
			anchor_offset: start + length,
			focus_offset: start + length
		};

		const definition = this.inspect(path);
		const next_marks = this.#restore_marks(
			text.marks,
			marks,
			start,
			length,
			definition.mark_types,
			nodes,
			false
		);
		const restored_annotations = this.#restore_attachments(
			annotations,
			start,
			length,
			definition.annotation_types,
			nodes,
			false
		);
		if (next_marks !== text.marks || restored_annotations.length > 0) {
			this.set(path, {
				...text,
				marks: next_marks,
				annotations: text.annotations.concat(restored_annotations)
			});
		}
		return this;
	}

	/**
	 * Deletes the given nodes if nothing references them anymore, and
	 * recursively the nodes that become unreferenced through them.
	 */
	_cascade_delete_unreferenced_nodes(potentially_orphaned_nodes: NodeId[]): void {
		if (potentially_orphaned_nodes.length === 0) return;
		// One document scan, then counts are released incrementally
		const ref_counts = build_reference_counts(this.schema, this.#doc);
		const orphans = new Set<NodeId>();
		const to_check = [...potentially_orphaned_nodes];
		while (to_check.length > 0) {
			const node_id = to_check.pop()!;
			if (orphans.has(node_id) || (ref_counts.get(node_id) ?? 0) > 0) continue;
			orphans.add(node_id);
			const node = this.#doc.nodes[node_id];
			if (!node) continue;
			for_each_reference(this.schema, node, (referenced_id) => {
				const count = ref_counts.get(referenced_id);
				if (count !== undefined) ref_counts.set(referenced_id, count - 1);
				to_check.push(referenced_id);
			});
		}
		for (const node_id of orphans) {
			const previous_value = this.#doc.nodes[node_id];
			if (!previous_value) continue;
			this.#record(['delete', node_id], ['create', previous_value]);
			this.deleted_node_ids.add(node_id);
		}
	}
}
