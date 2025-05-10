
export default class SveditDoc {
  selection = $state();  
  doc_id = $state();
  nodes = $state();

  constructor(schema, raw_doc) {
    this.selection = undefined;
    this.schema = schema;
    this.nodes = {};

    for (const node of raw_doc) {
      this.create(node);
    }

    // The last element in the raw_doc is the document itself (the root node)
    this.doc_id = raw_doc.at(-1).id;
  }

  // doc.get('list_1')
  // doc.get('list_1')
  // doc.get(['list_1', 'list_items'])
  get (path) {
    if (!path) return undefined
    if (typeof path === 'string') {
      return this.nodes[path];
    } else if (path.length === 1) {
      return this.nodes[path[0]];
    } else if (path.length > 1) {
      const node = this.nodes[path[0]];
      let val = node[path[1]];
      // This is used when the property value is an object,
      // so you can traverse the object (e.g. an array)
      for (let i = 2; i < path.length; i++) {
        if (!val) return undefined
        val = val[path[i]];
      }
      return val;
    }
  }

  // Set a property of a node to a new value
  // doc.set('list_1', 'list_items',  [1, 2, 3] })
  set (path, value) {
    const node = this.get(path[0]);
    // TODO: We need to remember the old value and make an entry to the undo stack
    node[path[1]] = value;
  }

  create(node) {
    // TODO: check if node is valid according to schema
    // If other nodes are referenced, those have to be in the graph already
    // NOTE: This is why the order of nodes in the raw_doc matters
    this.nodes[node.id] = node;
  }


  active_annotation(annotation_type) {
    if (this.selection?.type !== 'text') return null;
    
    const { start, end } = this.get_selection_range();
    const annotated_text = this.get(this.selection.path);
    const annotations = annotated_text[1];

    const active_annotation = annotations.find(([anno_start, anno_end, type]) => 
      (anno_start <= start && anno_end > start) || 
      (anno_start < end && anno_end >= end) ||
      (anno_start >= start && anno_end <= end)
    ) || null;

    if (annotation_type) {
      return active_annotation?.[2] === annotation_type;
    } else {
      return active_annotation;
    }
  }

  // TODO: think about ways how we can also turn a container
  // selection into plain text.
  get_selected_plain_text() {
    if (this.selection?.type !== 'text') return null;

    const start =   Math.min(this.selection.anchor_offset, this.selection.focus_offset);
    const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
    const annotated_text = this.get(this.selection.path);
    return annotated_text[0].slice(start, end);
  }

  get_selected_blocks() {
    if (this.selection?.type !== 'container') return null;

    const start =   Math.min(this.selection.anchor_offset, this.selection.focus_offset);
    const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
    const container = this.get(this.selection.path);
    return $state.snapshot(container.slice(start, end));
  }

  move_container_cursor(direction) {
    if (this.selection?.type !== 'container') return;
    const container = this.get(this.selection.path); // container is an array of blocks

    const { start, end } = this.get_selection_range();

    if (this.selection.anchor_offset !== this.selection.focus_offset) {
      // If selection is not collapsed, collapse it to the right or the left
      if (direction === 'forward') {
        this.selection.focus_offset = end;
        this.selection.anchor_offset = end;
      } else if (direction === 'backward') {
        this.selection.focus_offset = start;
        this.selection.anchor_offset = start;
      }
    } else if (direction === 'forward' && end < container.length) {
      this.selection.focus_offset = end + 1;
      this.selection.anchor_offset = end + 1;
    } else if (direction === 'backward' && start > 0) {
      this.selection.focus_offset = start - 1;
      this.selection.anchor_offset = start - 1;
    }
  }

  expand_container_selection(direction) {
    if (this.selection.type !== 'container') return;
    const container = this.get(this.selection.path);

    if (direction === 'forward') {
      this.selection.focus_offset = Math.min(this.selection.focus_offset + 1, container.length);
    } else if (direction === 'backward') {
      this.selection.focus_offset = Math.max(this.selection.focus_offset - 1, 0);
    }
  }

  annotate_text(annotation_type, annotation_data) {
    if (this.selection.type !== 'text') return;

    const { start, end } = this.get_selection_range();

    const annotated_text = structuredClone($state.snapshot(this.get(this.selection.path)));
    const annotations = annotated_text[1];
    const existing_annotations = this.active_annotation();


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

        this.set(this.selection.path, annotated_text);
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

    // Update the annotated text
    this.set(this.selection.path, annotated_text);
    this.selection = { ...this.selection };
  }

  delete() {
    if (!this.selection) return;
    const path = this.selection.path;
    // Get the start and end indices for the selection
    let start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
    let end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);

    // If selection is collapsed we delete the previous block
    if (start === end) {
      if (start > 0) {
        start = start - 1;
      } else {
        return; // cursor is at the very beginning, do nothing.
      }
    }

    if (this.selection.type === 'container') {
      const container = [...this.get(path)]; // container is an array of blocks

      // Remove the selected blocks from the container
      container.splice(start, end - start);

      // Update the container in the entry
      this.set(path, container);

      // Update the selection to point to the start of the deleted range
      this.selection = {
        type: 'container',
        path,
        anchor_offset: start,
        focus_offset: start
      };
    } else if (this.selection.type === 'text') {
      const path = this.selection.path;
      let text = structuredClone($state.snapshot(this.get(path)));

      text[0] = text[0].slice(0, start) + text[0].slice(end);
      this.set(path, text);

      this.selection = {
        type: 'text',
        path,
        anchor_offset: start,
        focus_offset: start
      };
    }
  }

  insert_blocks(blocks) {
    if (this.selection.type !== 'container') return;

    const path = this.selection.path;
    const container = [...this.get(path)];

    // Get the start and end indices for the selection
    let start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
    let end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);

    if (start !== end) {
      // Remove the selected blocks from the container
      container.splice(start, end - start);
    }

    container.splice(start, 0, ...blocks);

    // Update the container in the entry
    this.set(path, container);

    this.selection = {
      type: 'container',
      // NOTE: we hard code this temporarily as both story and list-item have a description property
      path: [...this.selection.path],
      anchor_offset: start,
      focus_offset: start + blocks.length
    };
  }
  
  // TODO: we need to also support annotations attached to replaced_text. This is needed to
  // support copy&paste including annotations. Currently the annotations are lost on paste.
  insert_text(replaced_text) {
    if (this.selection.type !== 'text') return;
    
    const annotated_text = structuredClone($state.snapshot(this.get(this.selection.path)));
    const { start, end } = this.get_selection_range();

    // Transform the plain text string.
    annotated_text[0] = annotated_text[0].slice(0, start) + replaced_text + annotated_text[0].slice(end);

    // Transform the annotations (annotated_text[1])
    // NOTE: Annotations are stored as [start_offset, end_offset, type]
    // Cover the following cases for all annotations:
    // 1. text inserted before the annotation (the annotation should be shifted by replaced_text.length - (end - start))
    // 2. text inserted inside an annotation (start>=annotation.start_offset und end <=annotation.end_offset)
    // 3. text inserted after an annotation (the annotation should be unchanged)
    // 4. the annotation is wrapped in start and end (the annotation should be removed)
    // 5. the annotation is partly selected towards right (e.g. start > annotation.start_offset && start < annotation.end_offset && end > annotation.end_offset): annotation_end_offset should be updated
    // 6. the annotation is partly selected towards left (e.g. start < annotation.start_offset && end > annotation.start_offset && end < annotation.end_offset): annotation_start_offset and end_offset should be updated

    const delta = replaced_text.length - (end - start);
    const new_annotations = annotated_text[1].map(annotation => {
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

    this.set(this.selection.path, [annotated_text[0], new_annotations]); // this will update the current state and create a history entry

    // Setting the selection automatically triggers a re-render of the corresponding DOMSelection.
    const new_selection = {
      type: 'text',
      path: this.selection.path,
      anchor_offset: start + replaced_text.length,
      focus_offset: start + replaced_text.length,
    };
    this.selection = new_selection;
  }

  undo() {
    if (this.history.length === 0) return;
    const previous = this.history[this.history.length - 1];
    const current_copy = {
      entry: structuredClone($state.snapshot(this.entry)),
      selection: structuredClone($state.snapshot(this.selection)),
    };
    
    // Directly update entry and selection with previous state
    this.entry = previous.entry;
    this.selection = previous.selection;
    this.history = this.history.slice(0, -1);
    this.future = [current_copy, ...this.future];
  }

  redo() {
    if (this.future.length === 0) return;
    const [next, ...remaining_future] = this.future;
    const current_copy = {
      entry: structuredClone($state.snapshot(this.entry)),
      selection: structuredClone($state.snapshot(this.selection)),
    };
    
    // Directly update entry and selection with next state
    this.entry = next.entry;
    this.selection = next.selection;
    
    this.history = [...this.history, current_copy];
    this.future = remaining_future;
  }

  select_parent() {
    if (this.selection?.type === 'text') {
      if (this.selection.path.length > 2) {
        // For text selections, we need to go up two levels
        const parent_path = this.selection.path.slice(0, -2);
        const currentIndex = parseInt(this.selection.path[this.selection.path.length - 2]);
        this.selection = {
          type: 'container',
          path: parent_path,
          anchor_offset: currentIndex,
          focus_offset: currentIndex + 1
        };
      } else {
        this.selection = undefined;
      }
    } else if (this.selection?.type === 'container') {
      // For container selections, we go up one level
      if (this.selection.path.length > 1) {
        const parent_path = this.selection.path.slice(0, -1);
        const currentIndex = parseInt(this.selection.path[this.selection.path.length - 1]);
        this.selection = {
          type: 'container',
          path: parent_path,
          anchor_offset: currentIndex,
          focus_offset: currentIndex + 1
        };
      } else {
        this.selection = undefined;
      }
    } else {
      this.selection = undefined;
    }
  }

  move(direction) {
    if (this.selection?.type !== 'container') return;

    const path = this.selection.path;
    const container = [...this.get(path)];
    const { start, end } = this.get_selection_range();

    const is_moving_up = direction === 'up';
    const offset = is_moving_up ? -1 : 1;

    if ((is_moving_up && start > 0) || (!is_moving_up && end < container.length)) {
      // Move the selected block(s)
      const moved_items = container.splice(start, end - start);
      container.splice(start + offset, 0, ...moved_items);

      // Update the container in the entry
      this.set(path, container);

      // Update the selection
      this.selection = {
        ...this.selection,
        anchor_offset: start + offset,
        focus_offset: end + offset
      };
    }
  }

  move_up() {
    this.move('up');
  }

  move_down() {
    this.move('down');
  }

  get_selection_range() {
    if (!this.selection) return null;
    
    const start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
    const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
    
    return {
      start,
      end,
      length: end - start
    };
  }

}
