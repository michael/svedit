import SveditTransaction from './SveditTransaction.svelte.js';
import { validate_node } from './util.js';

export default class SveditDoc {
  selection = $state();
  doc_id = $state();
  nodes = $state();

  constructor(schema, raw_doc, selection) {
    this.schema = schema;
    this.selection = selection;
    this.nodes = {};

    // These do not need to be reactive
    this.history = [];
    this.history_index = -1;

    // Initialize the nodes
    for (const node of raw_doc) {
      validate_node(node, this.schema);
      this.nodes[node.id] = node;
    }

    // The last element in the raw_doc is the document itself (the root node)
    this.doc_id = raw_doc.at(-1).id;
  }

  // Internal unsafe function: Never call this directly
  _apply_op(op) {
    const [type, ...args] = op;
    if (type === 'set') {
      const node = this.get(args[0].slice(0, -1));
      node[args[0].at(-1)] = args[1];
    } else if (type === 'create') {
      
      this.nodes[args[0].id] = args[0];
    } else if (type === 'delete') {
      delete this.nodes[args[0]];
    }
  }

  // Creates a new transaction
  get tr() {
    // We create a copy of the current document to avoid modifying the original
    const transaction_doc = new SveditDoc(this.schema, this.to_json(), this.selection);
    return new SveditTransaction(transaction_doc);
  }

  // Applies a transaction
  apply(transaction) {
    this.nodes = transaction.doc.nodes; // No deep copy, trust transaction's evolved state
    this.selection = transaction.doc.selection;
    if (this.history_index < this.history.length - 1) {
      this.history = this.history.slice(0, this.history_index + 1);
    }
    this.history.push({
      ops: transaction.ops,
      inverse_ops: transaction.inverse_ops,
      selection_before: transaction.selection_before,
      selection_after: this.selection
    });
    this.history_index++;
    return this;
  }

  undo() {
    if (this.history_index < 0) {
      console.warn('No changes to undo');
      return;
    }
    const change = this.history[this.history_index];
    const tr = this.tr;
    change.inverse_ops.forEach(op => tr.doc._apply_op(op));
    tr.set_selection(change.selection_before);
    this.nodes = tr.doc.nodes;
    this.selection = change.selection_before;
    this.history_index--;
    return this;
  }

  redo() {
    if (this.history_index >= this.history.length - 1) {
      console.warn('No changes to redo');
      return;
    }
    this.history_index++;
    const change = this.history[this.history_index];
    const tr = this.tr;
    change.ops.forEach(op => tr.doc._apply_op(op));
    tr.set_selection(change.selection_after);
    
    this.nodes = tr.doc.nodes;
    this.selection = change.selection_after;
    return this;
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
        // HACK: For now if the current path fragment is a number and the resolved value is a string,
        // we assume it was a node_id (reference to another node) inside a multiref
        // E.g. ['page_1', 'body', 0] would return the full node object not just the id.
        // TODO: we need to ask the schema for that to do this reliably
        if (parseInt(path[i]) !== NaN && typeof val === 'string') {
          val = this.nodes[val];
        }
      }
      return val;
    }
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

  get_selected_nodes() {
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

  // Traverses the document and returns a JSON representation.
  // IMPORTANT: Leaf nodes must go first, branches second and the root node last (depth-first traversal)
  // NOTE: Nodes that are not reachable from the root node will be purged on serialization.
  to_json() {
    const json = [];
    const visited = {};
    const visit = (node) => {
      if (!node || visited[node.id]) {
        return;
      }
      visited[node.id] = true;
      for (const [key, value] of Object.entries(node)) {
        // TODO: Use schema inspection and do this only for properties of type `multiref`
        if (Array.isArray(value)) {
          for (const v of value) {
            if (typeof v === 'string') {
              visit($state.snapshot(this.get(v)));
            }
          }
        } else if (typeof value === 'string') {
          // TODO: Use schema inspection and do this only for properties of type `ref`
          visit($state.snapshot(this.get(value)));
        }
      }
      // Finally add the node to the result.
      // We use a deep clone, so we make sure nothing of the original document is referenced.
      json.push(structuredClone(node));
    }
    visit($state.snapshot(this.get(this.doc_id)));
    return json;
  }
}
