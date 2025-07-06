import { is_valid_svid } from './util.js';

export default class Transaction {
  constructor(doc) {
    this.doc = doc;
    // Here we track the ops during the transaction
    this.ops = [];
    this.inverse_ops = [];
    // Remember the selection before the transaction started
    this.selection_before = this.doc.selection;
  }

  get(path) {
    return this.doc.get(path);
  }

  get selection() {
    return this.doc.selection;
  }

  // Set a property of a node to a new value
  // doc.set(["list_1", "list_items"],  [1, 2, 3] })
  // doc.set(["page_1", "body", "0", "description"], ["Hello world", []])
  set (path, value) {
    const node = this.doc.get(path.slice(0, -1));

    // Just to be sure, make a deep copy of the old value
    const previous_value = structuredClone($state.snapshot(node[path.at(-1)]));

    const op = ['set', path, value];
    this.ops.push(op);
    this.inverse_ops.push(['set', path, previous_value]);
    this.doc._apply_op(op);
  }

  create(node) {
    if (!is_valid_svid(node.id)) {
      throw new Error('Each node must have a valid SVID provided');
    }
    if (this.doc.get(node.id)) {
      throw new Error('Node with id ' + node.id + ' already exists');
    }
    const op = ['create', node];
    this.ops.push(op);
    this.inverse_ops.push(['delete', node.id]);
    this.doc._apply_op(op);
    return this;
  }

  delete(id) {
    const prev_value = $state.snapshot(this.doc.get(id));
    const op = ['delete', id];
    this.ops.push(op);
    this.inverse_ops.push(['create', prev_value]);
    this.doc._apply_op(op);
    return this;
  }

  set_selection(selection) {
    // TODO: Check if selection is valid and throw error if not
    this.doc.selection = selection;
    return this;
  }

  annotate_text(annotation_type, annotation_data) {
    if (this.doc.selection.type !== 'text') return;

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
      const index = annotations.findIndex(anno =>
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
        return;
      }
    }

    // Regular annotation handling
    if (start === end) {
      // For non-link annotations: You can not annotate text if the selection is collapsed.
      return;
    }

    if (existing_annotations) {
      // If there's an existing annotation of the same type, remove it
      if (existing_annotations[2] === annotation_type) {
        const index = annotations.findIndex(anno =>
          anno[0] === existing_annotations[0] &&
          anno[1] === existing_annotations[1] &&
          anno[2] === existing_annotations[2]
        );
        if (index !== -1) {
          annotations.splice(index, 1);
        }
      } else {
        // If there's an annotation of a different type, don't add a new one
        return;
      }
    } else {
      // If there's no existing annotation, add the new one
      annotations.push([start, end, annotation_type, annotation_data]);
    }

    // Update the annotated string
    this.set(this.doc.selection.path, annotated_string);
    this.doc.selection = { ...this.doc.selection };
    return this;
  }

  // Deletes selected text or nodes
  delete_selection() {
    if (!this.doc.selection) return;
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

      // Update the text content
      text[0] = text[0].slice(0, start) + text[0].slice(end);

      // Update annotation offsets for deletion
      const deletion_length = end - start;
      const new_annotations = text[1].map(annotation => {
        const [anno_start, anno_end, type, anno_data] = annotation;

        // Adjust start offset
        let new_start = anno_start;
        if (anno_start >= end) {
          // Start is after deletion - shift back
          new_start = anno_start - deletion_length;
        } else if (anno_start >= start) {
          // Start is within deletion - move to deletion point
          new_start = start;
        }
        // If start is before deletion, keep unchanged

        // Adjust end offset
        let new_end = anno_end;
        if (anno_end >= end) {
          // End is after deletion - shift back
          new_end = anno_end - deletion_length;
        } else if (anno_end > start) {
          // End is within deletion - move to deletion point
          new_end = start;
        }
        // If end is before deletion, keep unchanged

        // Remove annotation if it becomes invalid (start >= end)
        if (new_start >= new_end) {
          return false;
        }

        return [new_start, new_end, type, anno_data];
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

  // NOTE: We assume that we only insert new nodes, not reference existing ones
  insert_nodes(nodes) {
    if (this.doc.selection.type !== 'node') return;

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
      // NOTE: we hard code this temporarily as both story and list-item have a description property
      path: [...this.doc.selection.path],
      anchor_offset: start,
      focus_offset: start + nodes.length
    };
    return this;
  }

  // TODO: we need to also support annotations attached to replaced_text. This is needed to
  // support copy&paste including annotations. Currently the annotations are lost on paste.
  insert_text(replaced_text) {
    if (this.doc.selection.type !== 'text') return;

    const annotated_string = structuredClone($state.snapshot(this.doc.get(this.doc.selection.path)));
    const { start, end } = this.doc.get_selection_range();

    // Transform the plain text string.
    annotated_string[0] = annotated_string[0].slice(0, start) + replaced_text + annotated_string[0].slice(end);

    // Transform the annotations (annotated_string[1])
    // NOTE: Annotations are stored as [start_offset, end_offset, type]
    // Cover the following cases for all annotations:
    // 1. text inserted before the annotation (the annotation should be shifted by replaced_text.length - (end - start))
    // 2. text inserted inside an annotation (start>=annotation.start_offset und end <=annotation.end_offset)
    // 3. text inserted after an annotation (the annotation should be unchanged)
    // 4. the annotation is wrapped in start and end (the annotation should be removed)
    // 5. the annotation is partly selected towards right (e.g. start > annotation.start_offset && start < annotation.end_offset && end > annotation.end_offset): annotation_end_offset should be updated
    // 6. the annotation is partly selected towards left (e.g. start < annotation.start_offset && end > annotation.start_offset && end < annotation.end_offset): annotation_start_offset and end_offset should be updated

    const delta = replaced_text.length - (end - start);
    const new_annotations = annotated_string[1].map(annotation => {
      const [anno_start, anno_end, type, anno_data] = annotation;

      // Case 4: annotation is wrapped in start and end (remove it)
      if (start <= anno_start && end >= anno_end) {
        return false;
      }

      // Case 1: text inserted before the annotation
      if (end <= anno_start) {
        return [anno_start + delta, anno_end + delta, type, anno_data];
      }

      // Case 2: text inserted at the end or inside an annotation
      if (start >= anno_start && start <= anno_end) {
        console.log('Case 2: text inserted at the end or inside an annotation');
        if (start === anno_end) {
          // Text inserted right after the annotation
          return [anno_start, anno_end, type, anno_data];
        } else {
          // Text inserted inside the annotation
          return [anno_start, anno_end + delta, type, anno_data];
        }
      }

      // Case 3: text inserted after the annotation
      if (start >= anno_end) {
        return annotation;
      }

      // Case 5: annotation is partly selected towards right
      if (start > anno_start && start < anno_end && end > anno_end) {
        return [anno_start, start, type, anno_data];
      }

      // Case 6: annotation is partly selected towards left
      if (start < anno_start && end > anno_start && end < anno_end) {
        return [end + delta, anno_end + delta, type, anno_data];
      }

      // Default case: shouldn't happen, but keep the annotation unchanged
      return annotation;
    }).filter(Boolean);

    this.set(this.doc.selection.path, [annotated_string[0], new_annotations]); // this will update the current state and create a history entry

    // Setting the selection automatically triggers a re-render of the corresponding DOMSelection.
    const new_selection = {
      type: 'text',
      path: this.doc.selection.path,
      anchor_offset: start + replaced_text.length,
      focus_offset: start + replaced_text.length,
    };
    this.doc.selection = new_selection;
    return this;
  }

  // Helper method to recursively delete unreferenced nodes
  _cascade_delete_unreferenced_nodes(node_ids) {
    const nodes_to_delete = new Set();
    const to_check = [...node_ids];

    while (to_check.length > 0) {
      const node_id = to_check.pop();

      // Skip if already marked for deletion
      if (nodes_to_delete.has(node_id)) continue;

      // Count references excluding nodes already marked for deletion
      const ref_count = this._count_references_excluding_deleted(node_id, nodes_to_delete);

      if (ref_count === 0) {
        // No more references, safe to delete this node
        nodes_to_delete.add(node_id);

        // Also check all nodes referenced by this node
        const referenced_nodes = this.doc.get_referenced_nodes(node_id);
        to_check.push(...referenced_nodes);
      }
    }

    // Delete all unreferenced nodes
    for (const node_id of nodes_to_delete) {
      this.delete(node_id);
    }
  }

  // Count references to a node, excluding nodes that are marked for deletion
  _count_references_excluding_deleted(target_node_id, nodes_to_delete) {
    let count = 0;

    for (const node of Object.values(this.doc.nodes)) {
      // Skip nodes that are marked for deletion
      if (nodes_to_delete.has(node.id)) continue;

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
