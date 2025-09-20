/**
 * @import { NodeId, SerializedNode, Selection, DocumentPath } from './types.js'
 */

import { get_char_length, char_slice, traverse } from './util.js';

/**
 * Transaction class for managing atomic document operations with undo/redo support.
 *
 * A Transaction provides a way to group multiple document operations (create, delete, set)
 * into a single atomic unit that can be applied or rolled back as one. It maintains
 * both forward operations and their inverse operations for undo functionality.
 *
 * @example
 * ```js
 * const tr = doc.tr;
 * tr.set(['node_1', 'title'], 'New Title');
 * tr.create({id: 'node_2', type: 'paragraph', content: 'Hello'});
 * doc.apply(tr); // Applies all operations atomically
 * ```
 */
export default class Transaction {
  /**
   * Creates a new Transaction for the given document.
   *
   * @param {any} doc - The document instance this transaction operates on
   */
  constructor(doc) {
    this.doc = doc;
    // Here we track the ops during the transaction
    /** @type {Record<string, any>[]} */
    this.ops = [];
    /** @type {Record<string, any>[]} */
    this.inverse_ops = [];
    // Remember the selection before the transaction started
    this.selection_before = this.doc.selection;
  }

  /**
   * Gets a value from the document at the specified path.
   *
   * @param {DocumentPath} path - The path to the value in the document
   * @returns {any} The value at the specified path
   */
  get(path) {
    return this.doc.get(path);
  }

  /**
   * Gets the current selection state of the document.
   *
   * @returns {Selection} The current selection object
   */
  get selection() {
    return this.doc.selection;
  }

  /**
   * Sets a property of a node to a new value.
   *
   * This is the core operation for modifying document properties. It records
   * both the forward operation and its inverse for undo support.
   *
   * @param {DocumentPath} path - Array path to the property (e.g., ["node_1", "title"])
   * @param {any} value - The new value to set
   *
   * @example
   * ```js
   * tr.set(["list_1", "list_items"], [1, 2, 3]);
   * tr.set(["page_1", "body", "0", "description"], {text: "Hello world", annotations: []});
   * ```
   */
  set (path, value) {
    const node = this.doc.get(path.slice(0, -1));

    // Turns ["page_1", "body", "0", "description"]
    // into ["paragraph_1", "description"].
    // Important to keep changes of multiple ops invertible.
    const normalized_path = [node.id, path.at(-1)];

    // Just to be sure, make a deep copy of the old value
    const property_key = path.at(-1);
    if (property_key === undefined) {
      throw new Error('Invalid path: cannot get property key');
    }
    const previous_value = structuredClone($state.snapshot(node[property_key]));

    const op = ['set', normalized_path, value];
    this.ops.push(op);
    this.inverse_ops.push(['set', path, previous_value]);
    this.doc._apply_op(op);
  }

  // Takes a subgraph and constructs new nodes from it
  // NOTE: all ids will be mapped to new unique ids.
  // NOTE: Omitted properties will be populated with default values.
  build(node_id, nodes) {
    const depth_first_nodes = traverse(node_id, this.doc.schema, nodes);
    // This maps original ids to newly generated ids
    const id_map = {};

    for (const node of depth_first_nodes) {
      const new_id = this.doc.generate_id();
      id_map[node.id] = new_id;
      const new_node = { ...node, id: new_id };
      const node_schema = this.doc.schema[node.type];

      // Update all property references to use new IDs
      for (const [property_name, property_schema] of Object.entries(node_schema.properties)) {
        // if (property_name === 'id' || property_name === 'type') continue;
        const property_type = property_schema.type;
        const value = node[property_name];

        // Apply default values
        if (property_type === 'node_array') {
          // [] is the default value for node arrays
          new_node[property_name] = Array.isArray(value) ? value.map(ref_id => id_map[ref_id]) : [];
        } else if (property_type === 'node') {
          // null is the default value for node references
          new_node[property_name] = typeof value === 'string' ? id_map[value] : null;
        } else if (property_type === 'annotated_text') {
          if (value) {
            const annotations = value.annotations.map(annotation => {
              const {start_offset, end_offset, node_id} = annotation;
              return {start_offset, end_offset, node_id: id_map[node_id] || node_id};
            });
            new_node[property_name] = {text: value.text, annotations};
          } else {
            new_node[property_name] = {text: '', annotations: []};
          }
        } else if (property_type === 'string') {
          new_node[property_name] = value ?? property_schema.default ?? '';
        } else if (property_type === 'integer') {
          new_node[property_name] = value ?? property_schema.default ?? 0;
        } else if (property_type === 'number') {
          new_node[property_name] = value ?? property_schema.default ?? 0;
        } else if (property_type === 'boolean') {
          new_node[property_name] = value ?? property_schema.default ?? false;
        } else if (['integer_array', 'number_array'].includes(property_type)) {
          new_node[property_name] = value ?? property_schema.default ?? [];
        } else if (property_type === 'string_array') {
          new_node[property_name] = value ?? property_schema.default ?? [];
        }
      }

      console.log('created', new_node);
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
    this.doc.validate_node(node);

    if (this.doc.get(node.id)) {
      throw new Error('Node with id ' + node.id + ' already exists');
    }

    const op = ['create', node];
    this.ops.push(op);
    this.inverse_ops.push(['delete', node.id]);
    this.doc._apply_op(op);
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
    const previous_value = $state.snapshot(this.doc.get(id));
    const op = ['delete', id];
    this.ops.push(op);
    this.inverse_ops.push(['create', previous_value]);
    this.doc._apply_op(op);
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
    this.doc._validate_selection(selection);
    this.doc.selection = selection;
    return this;
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
    if (this.doc.selection.type !== 'text') return this;

    const { start, end } = this.doc.get_selection_range();
    const annotated_text = structuredClone($state.snapshot(this.doc.get(this.doc.selection.path)));
    const annotations = annotated_text.annotations;
    const existing_annotation = this.doc.active_annotation();
    const existing_annotation_same_type = this.doc.active_annotation(annotation_type);

    if (existing_annotation) {
      // If there's an existing annotation of the same type, remove it
      if (existing_annotation_same_type) {
        const index = annotations.findIndex(/** @param {any} anno */ (anno) =>
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
      if (!this.doc.available_annotation_types.includes(annotation_type)) {
        console.log(`Annotation type ${annotation_type} is not allowed here.`);
        return this;
      }

      const new_annotation_node = {
        id: this.doc.generate_id(),
        type: annotation_type,
        ...annotation_properties,
      }
      this.create(new_annotation_node);
      // If there's no existing annotation, add the new one
      annotations.push({start_offset: start, end_offset: end, node_id: new_annotation_node.id});
    }

    // Update the annotated text
    this.set(this.doc.selection.path, annotated_text);
    return this;
  }

  /**
   * Deletes the currently selected text or nodes.
   *
   * Behavior depends on selection type:
   * - For node selections: Removes selected nodes and cascades deletion of unreferenced nodes
   * - For text selections: Removes selected text and adjusts annotations accordingly
   * - For collapsed selections: Deletes the previous character/node
   *
   * @returns {Transaction} This transaction instance for method chaining
   */
  delete_selection() {
    if (!this.doc.selection) return this;
    const path = this.doc.selection.path;
    // Get the start and end indices for the selection
    let start = Math.min(this.doc.selection.anchor_offset, this.doc.selection.focus_offset);
    let end = Math.max(this.doc.selection.anchor_offset, this.doc.selection.focus_offset);

    // If selection is collapsed we delete the previous node
    if (start === end) {
      if (start > 0) {
        start = start - 1;
      } else {
        return this; // cursor is at the very beginning, do nothing.
      }
    }

    if (this.doc.selection.type === 'node') {
      const node_array = [...this.doc.get(path)];

      // Get the node IDs that will be removed
      const removed_node_ids = node_array.slice(start, end);

      // Remove the selected nodes from the node_array
      node_array.splice(start, end - start);

      // Update the node_array in the entry (this implicitly records an op via this.set)
      this.set(path, node_array);

      // Now check which nodes should be deleted based on reference counting
      this._cascade_delete_unreferenced_nodes(removed_node_ids);

      // Update the selection to point to the start of the deleted range
      this.doc.selection = {
        type: 'node',
        path,
        anchor_offset: start,
        focus_offset: start
      };
    } else if (this.doc.selection.type === 'text') {
      const path = this.doc.selection.path;
      let text = structuredClone($state.snapshot(this.doc.get(path)));

      // Update the text content using character-based operations
      const original_text = text.text;
      text.text = char_slice(original_text, 0, start) + char_slice(original_text, end, get_char_length(original_text));

      // To mark annotation nodes for deletion.
      const _deleted_nodes = [];
      // Update annotation offsets for deletion
      const deletion_length = end - start;
      const new_annotations = text.annotations.map(/** @param {any} annotation */ (annotation) => {
        const {start_offset: annotation_start, end_offset: annotation_end, node_id} = annotation;

        // Adjust start offset
        let new_start = annotation_start;
        if (annotation_start >= end) {
          // Start is after deletion - shift back
          new_start = annotation_start - deletion_length;
        } else if (annotation_start >= start) {
          // Start is within deletion - move to deletion point
          new_start = start;
        }
        // If start is before deletion, keep unchanged

        // Adjust end offset
        let new_end = annotation_end;
        if (annotation_end >= end) {
          // End is after deletion - shift back
          new_end = annotation_end - deletion_length;
        } else if (annotation_end > start) {
          // End is within deletion - move to deletion point
          new_end = start;
        }
        // If end is before deletion, keep unchanged

        // Remove annotation if it becomes invalid (start >= end)
        if (new_start >= new_end) {
          console.log('deleting annotation');
          _deleted_nodes.push(node_id);
          return false;
        }

        return {start_offset: new_start, end_offset: new_end, node_id};
      }).filter(Boolean);

      text.annotations = new_annotations;

      // Update the text in the entry (this implicitly records an op via this.set)
      this.set(path, text);

      // Remove annotation nodes that were implicitly deleted.
      for (const node_id of _deleted_nodes) {
        this.delete(node_id);
      }

      this.set_selection({
        type: 'text',
        path,
        anchor_offset: start,
        focus_offset: start
      });
    }
    return this;
  }

  /**
   * Inserts an array of nodes at the current node selection.
   *
   * If there's a current selection, it will be deleted first.
   *
   * @param {NodeId[]} node_ids - Array of node IDs to insert
   * @returns {Transaction} This transaction instance for method chaining
   *
   * @example
   * ```js
   * tr.insert_nodes_new(['para_1', 'para_2']);
   * ```
   */
  insert_nodes(node_ids) {
    if (this.doc.selection.type !== 'node') return this;

    // Unless cursor is collapsed, delete the selected nodes as a first step
    if (this.doc.selection.anchor_offset !== this.doc.selection.focus_offset) {
      this.delete_selection();
    }

    const path = this.doc.selection.path;
    const node_array = [...this.doc.get(path)];

    // Get the start and end indices for the selection
    let start = Math.min(this.doc.selection.anchor_offset, this.doc.selection.focus_offset);
    let end = Math.max(this.doc.selection.anchor_offset, this.doc.selection.focus_offset);

    if (start !== end) {
      // Remove the currently selected nodes from the node_array
      // NOTE: We are okay that only the refernces are removed and nodes potentially become orphaned.
      // They'll be purged on doc.to_json() anyways.
      node_array.splice(start, end - start);
    }

    node_array.splice(start, 0, ...node_ids);

    // Update the node_array in the entry
    this.set(path, node_array);

    this.doc.selection = {
      type: 'node',
      path: [...this.doc.selection.path],
      anchor_offset: start,
      focus_offset: start + node_ids.length
    };
    return this;
  }

  /**
   * Inserts text at the current text selection, replacing any selected content.
   *
   * Updates both the text content and adjusts annotation offsets to maintain
   * annotation integrity after the text insertion.
   *
   * @param {string} replaced_text - The text to insert
   * @returns {Transaction} This transaction instance for method chaining
   *
   * @todo Support annotations attached to replaced_text for full copy&paste support
   *
   * @example
   * ```js
   * tr.insert_text('Hello, world!');
   * ```
   */
  insert_text(replaced_text, annotations = [], nodes = {}) {
    if (this.doc.selection.type !== 'text') return this;

    const annotated_text = structuredClone($state.snapshot(this.doc.get(this.doc.selection.path)));
    const { start, end } = this.doc.get_selection_range();

    // Transform the plain text string using character-based operations
    const text = annotated_text.text;
    annotated_text.text = char_slice(text, 0, start) + replaced_text + char_slice(text, end, get_char_length(text));

    // Transform the annotations (annotated_text.annotations)
    // NOTE: Annotations are stored as {start_offset, end_offset, node_id}
    const delta = get_char_length(replaced_text) - (end - start);
    const new_annotations = annotated_text.annotations.map(/** @param {any} annotation */ (annotation) => {
      const {start_offset: annotation_start, end_offset: annotation_end, node_id} = annotation;

      // Case 1: annotation is wrapped in start and end (remove it)
      if (start <= annotation_start && end >= annotation_end) {
        return false;
      }

      // Case 2: text inserted before the annotation
      if (end <= annotation_start) {
        return {start_offset: annotation_start + delta, end_offset: annotation_end + delta, node_id};
      }

      // Case 3: text inserted after the annotation
      if (start >= annotation_end) {
        return annotation;
      }

      // Case 4: annotation is partly selected towards right
      // NOTE: replaced_text will not be part of the annotation, we treat it the same as
      // a cursor right after the annotation
      if (start > annotation_start && start < annotation_end && end >= annotation_end) {
        return {start_offset: annotation_start, end_offset: start, node_id};
      }

      // Case 5: text inserted inside an annotation
      if (start >= annotation_start && start <= annotation_end && end < annotation_end && end >= annotation_start) {
        return {start_offset: annotation_start, end_offset: annotation_end + delta, node_id};
      }

      // Case 6: annotation is partly selected towards left
      // NOTE: replaced_text will not be part of the annotation, we treat it the same as
      // a cursor right before the annotation
      if (start < annotation_start && end > annotation_start && end < annotation_end) {
        return {start_offset: start + get_char_length(replaced_text), end_offset: annotation_end + delta, node_id};
      }

      // Unhandled edge case:
      console.error('annotation could not be transformed: ', annotation);
      throw new Error('Case for transforming annotation not covered');

      // return annotation;
    }).filter(Boolean);

    annotated_text.annotations = new_annotations;
    this.set(this.doc.selection.path, annotated_text); // this will update the current state and create a history entry

    // Setting the selection automatically triggers a re-render of the corresponding DOMSelection.
    const new_selection = {
      type: 'text',
      path: this.doc.selection.path,
      anchor_offset: start + get_char_length(replaced_text),
      focus_offset: start + get_char_length(replaced_text),
    };
    this.doc.selection = new_selection;

    // Now we apply annotations if there are any, but only if there's no active annotation
    // at the current collapsed cursor
    if (!this.doc.active_annotation() && annotations.length > 0) {
      const new_annotations = annotations.map(annotation => {
        const original_annotation_node = nodes[annotation.node_id];
        const text_property_schema = this.doc.inspect(this.doc.selection.path);
        // console.log('original_annotation_node.type', original_annotation_node.type);
        // console.log('text_property_schema', text_property_schema);
        if (text_property_schema.node_types.includes(original_annotation_node.type)) {
          const new_annotation_node_id = this.build(annotation.node_id, nodes);
          return {
            start_offset: start + annotation.start_offset,
            end_offset: start + annotation.end_offset,
            node_id: new_annotation_node_id
          };
        } else {
          // Annotation type not allowed in new context, skip it.
          return null;
        }
      }).filter(Boolean);
      const next_annotated_text = structuredClone(annotated_text);
      next_annotated_text.annotations = next_annotated_text.annotations.concat(new_annotations);
      this.set(this.doc.selection.path, next_annotated_text); // this will update the current state and create a history entry
    }

    return this;
  }

  /**
   * Recursively deletes nodes that become unreferenced after the initial deletion.
   *
   * This method implements cascade deletion by checking reference counts and
   * removing nodes that are no longer referenced by any other nodes in the document.
   *
   * @param {NodeId[]} removed_node_ids - Array of node IDs that were initially removed
   * @private
   */
  _cascade_delete_unreferenced_nodes(removed_node_ids) {
    /** @type {Record<NodeId, boolean>} */
    const nodes_to_delete = {};
    const to_check = [...removed_node_ids];

    while (to_check.length > 0) {
      const node_id = to_check.pop();

      // Skip if node_id is undefined (shouldn't happen since we check length)
      if (!node_id) continue;

      // Skip if already marked for deletion
      if (nodes_to_delete[node_id]) continue;

      // Count references excluding nodes already marked for deletion
      const ref_count = this._count_references_excluding_deleted(node_id, nodes_to_delete);

      if (ref_count === 0) {
        // No more references, safe to delete this node
        nodes_to_delete[node_id] = true;

        // Also check all nodes referenced by this node
        const referenced_nodes = this.doc.get_referenced_nodes(node_id);
        to_check.push(...referenced_nodes);
      }
    }

    // Delete all unreferenced nodes
    for (const node_id in nodes_to_delete) {
      this.delete(node_id);
    }
  }

  /**
   * Counts references to a target node, excluding nodes that are marked for deletion.
   *
   * This is used during cascade deletion to determine if a node can be safely
   * deleted without breaking document integrity.
   *
   * @param {NodeId} target_node_id - The node ID to count references for
   * @param {Record<NodeId, boolean>} nodes_to_delete - Nodes already marked for deletion
   * @returns {number} The number of references to the target node
   * @private
   */
  _count_references_excluding_deleted(target_node_id, nodes_to_delete) {
    let count = 0;

    for (const node of Object.values(this.doc.nodes)) {
      // Skip nodes that are marked for deletion
      if (nodes_to_delete[node.id]) continue;

      for (const [property, value] of Object.entries(node)) {
        if (property === 'id' || property === 'type') continue;

        const prop_type = this.doc.property_type(node.type, property);

        if (prop_type === 'node_array' && Array.isArray(value)) {
          count += value.filter(id => id === target_node_id).length;
        } else if (prop_type === 'node' && value === target_node_id) {
          count += 1;
        } else if (prop_type === 'annotated_text' && value && value.annotations) {
          count += value.annotations.filter(annotation => annotation.node_id === target_node_id).length;
        }
      }
    }

    return count;
  }
}
