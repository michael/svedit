/**
 * @import { NodeId, SerializedNode, Selection, DocumentPath } from './types.js'
 */

import { get_char_length, char_slice } from './util.js';

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
   * tr.set(["page_1", "body", "0", "description"], ["Hello world", []]);
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
   * @todo Check if selection is valid and throw error if not
   */
  set_selection(selection) {
    // TODO: Check if selection is valid and throw error if not
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
   * @param {any} annotation_data - Additional data for the annotation (e.g., href for links)
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
  annotate_text(annotation_type, annotation_data) {
    if (this.doc.selection.type !== 'text') return this;

    const { start, end } = this.doc.get_selection_range();
    const annotated_string = structuredClone($state.snapshot(this.doc.get(this.doc.selection.path)));
    const annotations = annotated_string[1];
    const existing_annotations = this.doc.active_annotation();

    // Special annotation type handling should probably be done in a separate function.
    // The goal is to keep the core logic simple and allow developer to extend and pick only what they need.
    // It could also be abstracted to not check for type (e.g. "link") but for a special attribute
    // e.g. "zero-range-updatable" for annotations that are updatable without a range selection change.

    // Special handling for links when there's no selection range
    // Links should be updatable by just clicking on them without a range selection
    if (annotation_type === 'link' && start === end && existing_annotations) {

      // Use findIndex for deep comparison of annotation properties (comparison of annotation properties rather than object reference via indexOf)
      const index = annotations.findIndex(/** @param {any} anno */ (anno) =>
        anno[0] === existing_annotations[0] &&
        anno[1] === existing_annotations[1] &&
        anno[2] === existing_annotations[2]
      );
      // const index = annotations.indexOf(existing_annotations);

      if (index !== -1) {
        if (annotation_data.href === '') {
          // Remove the annotation if the href is empty
          annotations.splice(index, 1);
        } else {
          annotations[index] = [
            existing_annotations[0],
            existing_annotations[1],
            'link',
            { ...existing_annotations[3], ...annotation_data }
          ];
        }

        this.set(this.doc.selection.path, annotated_string);
        return this;
      }
    }

    // Regular annotation handling
    if (start === end) {
      // For non-link annotations: You can not annotate text if the selection is collapsed.
      return this;
    }

    if (existing_annotations) {
      // If there's an existing annotation of the same type, remove it
      if (existing_annotations[2] === annotation_type) {
        const index = annotations.findIndex(/** @param {any} anno */ (anno) =>
          anno[0] === existing_annotations[0] &&
          anno[1] === existing_annotations[1] &&
          anno[2] === existing_annotations[2]
        );
        if (index !== -1) {
          annotations.splice(index, 1);
        }
      } else {
        // If there's an annotation of a different type, don't add a new one
        return this;
      }
    } else {
      // If there's no existing annotation, add the new one
      annotations.push([start, end, annotation_type, annotation_data]);
    }

    // Update the annotated string
    this.set(this.doc.selection.path, annotated_string);
    // Not needed anymore as doc.apply makes sure selection is rerendered
    // this.doc.selection = { ...this.doc.selection };
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
      const original_text = text[0];
      text[0] = char_slice(original_text, 0, start) + char_slice(original_text, end, get_char_length(original_text));

      // Update annotation offsets for deletion
      const deletion_length = end - start;
      const new_annotations = text[1].map(/** @param {any} annotation */ (annotation) => {
        const [annotation_start, annotation_end, type, annotation_data] = annotation;

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
          return false;
        }

        return [new_start, new_end, type, annotation_data];
      }).filter(Boolean);

      text[1] = new_annotations;

      // Update the text in the entry (this implicitly records an op via this.set)
      this.set(path, text);
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
   * If there's a current selection, it will be deleted first. New nodes are
   * created if they don't already exist (e.g., for cut+paste scenarios).
   *
   * @param {SerializedNode[]} nodes - Array of node objects to insert
   * @returns {Transaction} This transaction instance for method chaining
   *
   * @note Assumes we only insert new nodes, not reference existing ones
   *
   * @example
   * ```js
   * tr.insert_nodes([
   *   {id: 'para_1', type: 'paragraph', content: ['Hello', []]},
   *   {id: 'para_2', type: 'paragraph', content: ['World', []]}
   * ]);
   * ```
   */
  insert_nodes(nodes) {
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

    // First create the new nodes (unless they already exists e.g. in case of cut+paste)
    nodes.forEach(node => {
      if (!this.doc.get(node.id)) {
        this.create(node);
      }
    });
    const node_ids = nodes.map(node => node.id);
    node_array.splice(start, 0, ...node_ids);

    // Update the node_array in the entry
    this.set(path, node_array);

    this.doc.selection = {
      type: 'node',
      path: [...this.doc.selection.path],
      anchor_offset: start,
      focus_offset: start + nodes.length
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
  insert_text(replaced_text) {
    if (this.doc.selection.type !== 'text') return this;

    const annotated_string = structuredClone($state.snapshot(this.doc.get(this.doc.selection.path)));
    const { start, end } = this.doc.get_selection_range();

    // Transform the plain text string using character-based operations
    const text = annotated_string[0];
    annotated_string[0] = char_slice(text, 0, start) + replaced_text + char_slice(text, end, get_char_length(text));

    // Transform the annotations (annotated_string[1])
    // NOTE: Annotations are stored as [start_offset, end_offset, type]
    const delta = get_char_length(replaced_text) - (end - start);
    const new_annotations = annotated_string[1].map(/** @param {any} annotation */ (annotation) => {
      const [annotation_start, annotation_end, type, annotation_data] = annotation;

      // Case 1: annotation is wrapped in start and end (remove it)
      if (start <= annotation_start && end >= annotation_end) {
        return false;
      }

      // Case 2: text inserted before the annotation
      if (end <= annotation_start) {
        return [annotation_start + delta, annotation_end + delta, type, annotation_data];
      }

      // Case 3: text inserted after the annotation
      if (start >= annotation_end) {
        return annotation;
      }

      // Case 4: annotation is partly selected towards right
      // NOTE: replaced_text will not be part of the annotation, we treat it the same as
      // a cursor right after the annotation
      if (start > annotation_start && start < annotation_end && end >= annotation_end) {
        return [annotation_start, start, type, annotation_data];
      }

      // Case 5: text inserted inside an annotation
      if (start >= annotation_start && start <= annotation_end && end < annotation_end && end >= annotation_start) {
        return [annotation_start, annotation_end + delta, type, annotation_data];
      }

      // Case 6: annotation is partly selected towards left
      // NOTE: replaced_text will not be part of the annotation, we treat it the same as
      // a cursor right before the annotation
      if (start < annotation_start && end > annotation_start && end < annotation_end) {
        return [start + get_char_length(replaced_text), annotation_end + delta, type, annotation_data];
      }

      // Unhandled edge case:
      console.error('annotation could not be transformed: ', annotation);
      throw new Error('Case for transforming annotation not covered');

      // return annotation;
    }).filter(Boolean);

    this.set(this.doc.selection.path, [annotated_string[0], new_annotations]); // this will update the current state and create a history entry

    // Setting the selection automatically triggers a re-render of the corresponding DOMSelection.
    const new_selection = {
      type: 'text',
      path: this.doc.selection.path,
      anchor_offset: start + get_char_length(replaced_text),
      focus_offset: start + get_char_length(replaced_text),
    };
    this.doc.selection = new_selection;
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
        }
      }
    }

    return count;
  }
}
