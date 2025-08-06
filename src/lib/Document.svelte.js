import Transaction from './Transaction.svelte.js';
import { validate_node } from './util.js';

export default class Document {
  selection = $state();
  config = $state();
  document_id = $state();
  nodes = $state();
  history = $state([]);
  history_index = $state(-1);

  // Reactive helpers for UI state
  can_undo = $derived(this.history_index >= 0);
  can_redo = $derived(this.history_index < this.history.length - 1);

	// Reactive variable for selected node
	selected_node = $derived(this.get_selected_node());

  constructor(schema, raw_doc, { selection, config } = {}) {
    this.schema = schema;
    this.selection = selection;
    this.config = config;
    this.nodes = {};

    // Initialize the nodes
    for (const node of raw_doc) {
      validate_node(node, this.schema);
      this.nodes[node.id] = node;
    }

    // The last element in the raw_doc is the document itself (the root node)
    this.document_id = raw_doc.at(-1).id;
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
			const owner_node = this.get(this.selection.path.slice(0, -1));
			return owner_node;
		}
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
    const transaction_doc = new Document(this.schema, this.to_json(), {
      config: this.config,
      selection: this.selection
    });
    return new Transaction(transaction_doc);
  }

  // Applies a transaction
  apply(transaction) {
    this.nodes = transaction.doc.nodes; // No deep copy, trust transaction's evolved state
    // Make sure selection gets a new reference (is rerendered)
    this.selection = { ...transaction.doc.selection };
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


    // this.selection = { ...this.selection };
    return this;
  }

  undo() {
    if (this.history_index < 0) {
      return;
    }
    const change = this.history[this.history_index];
    const tr = this.tr;
    change.inverse_ops.slice().reverse().forEach(op => tr.doc._apply_op(op));
    this.nodes = tr.doc.nodes;
    this.selection = change.selection_before;
    this.history_index--;
    return this;
  }

  redo() {
    if (this.history_index >= this.history.length - 1) {
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

  // doc.get('list_1') => { type: 'list', id: 'list_1', ... }
  // doc.get(['list_1', 'list_items']) => [ 'list_item_1', 'list_item_2' ]
  // doc.get(['page_1', 'body', 3, 'list_items', 0]) => { type: 'list_item', id: 'list_item_1', ... }
  // doc.get(['page_1', 'cover', 'title']) => ['Hello world', []]
  get(path) {
    if (typeof path === 'string') {
      path = [ path ];
    }
    if (!(Array.isArray(path) && path.length >= 1)) {
      throw new Error('Invalid path provided', path);
    }

    let val = this.nodes[path[0]];
    let val_type = 'node';

    for (let i = 1; i < path.length; i++) {
      const path_segment = path[i];
      if (val_type === 'node') {
        if (this.property_type(val.type, path_segment) === 'node_array') {
          val = val[path_segment]; // e.g. for the page body ['list_1', 'paragraph_1']
          val_type = 'node_array';
        } else if (this.property_type(val.type, path_segment) === 'node') {
          val = this.nodes[val[path_segment]];
          val_type = 'node';
        } else if (['string_array', 'integer_array'].includes(this.property_type(val.type, path_segment))) {
          val = val[path_segment];
          val_type = 'value_array';
        } else {
          // Resolve value properties sucha as string, integer, datetime
          val = val[path_segment];
          val_type = 'value';
        }
      } else if (val_type === 'node_array') {
        // We expect the val to be an array of node ids and the path_segment to be an array index
        val = this.nodes[val[path_segment]];
        val_type = 'node';
      } else if (val_type === 'value_array') {
        val = val[path_segment];
        val_type = 'value';
      }
    }
    return val;
  }

  // While .get gives you the value of a path, inspect gives you
  // the type info of that value.
  //
  // doc.inspect(['page_1', 'body'] => {
  //   kind: 'property',
  //   name: 'body',
  //   type: 'node_array',
  //   node_types: ['text', 'story', 'list'],
  //   default_node_type: 'text'
  // }
  //
  // doc.inspect(['page_1', 'body', 1]) => {
  //   kind: 'node',
  //   id: 'paragraph_234',
  //   type: 'paragraph',
  //   properties: {...}
  // }
  inspect(path) {
    const parent = path.length > 1 ? this.get(path.slice(0, -1)) : undefined;
    if (parent?.type) {
      // Parent is a node, so we are dealing with a property.
      const property_name = path.at(-1);
      return  {
        kind: 'property',
        name: property_name,
        // Merge property spec from schema
        ...this.schema[parent.type][property_name]
      };
    } else {
      // Parent is a property (or we are at the root), so we are dealing with a node.
      const node = this.get(path);
      return {
        kind: 'node',
        id: node.id,
        type: node.type,
        properties: this.schema[node.type]
      }
    }
  }

  active_annotation(annotation_type) {
    if (this.selection?.type !== 'text') return null;

    const { start, end } = this.get_selection_range();
    const annotated_string = this.get(this.selection.path);
    const annotations = annotated_string[1];

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

  // TODO: think about ways how we can also turn a node selection into plain text.
  get_selected_plain_text() {
    if (this.selection?.type !== 'text') return null;

    const start =   Math.min(this.selection.anchor_offset, this.selection.focus_offset);
    const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
    const annotated_string = this.get(this.selection.path);
    return annotated_string[0].slice(start, end);
  }

  get_selected_nodes() {
    if (this.selection?.type !== 'node') return null;

    const start =   Math.min(this.selection.anchor_offset, this.selection.focus_offset);
    const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);
    const node_array = this.get(this.selection.path);
    return $state.snapshot(node_array.slice(start, end));
  }

  move_node_cursor(direction) {
    if (this.selection?.type !== 'node') return;
    const node_array = this.get(this.selection.path);

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
    } else if (direction === 'forward' && end < node_array.length) {
      this.selection.focus_offset = end + 1;
      this.selection.anchor_offset = end + 1;
    } else if (direction === 'backward' && start > 0) {
      this.selection.focus_offset = start - 1;
      this.selection.anchor_offset = start - 1;
    }
  }

  expand_node_selection(direction) {
    if (this.selection.type !== 'node') return;
    const node_array = this.get(this.selection.path);

    if (direction === 'forward') {
      this.selection.focus_offset = Math.min(this.selection.focus_offset + 1, node_array.length);
    } else if (direction === 'backward') {
      this.selection.focus_offset = Math.max(this.selection.focus_offset - 1, 0);
    }
  }

  select_parent() {
    if (['text', 'property'].includes(this.selection?.type)) {
      // For text and property selections (e.g. ['page_1', 'body', 0, 'image']), we need to go up two levels
      // in the path
      if (this.selection.path.length > 3) {
        const parent_path = this.selection.path.slice(0, -2);
        const currentIndex = parseInt(this.selection.path[this.selection.path.length - 2]);
        this.selection = {
          type: 'node',
          path: parent_path,
          anchor_offset: currentIndex,
          focus_offset: currentIndex + 1
        };
      } else {
        this.selection = undefined;
      }
    } else if (this.selection?.type === 'node') {
      // For node selections, we go up one level
      if (this.selection.path.length > 3) {
        const parent_path = this.selection.path.slice(0, -2);
        const currentIndex = parseInt(this.selection.path[this.selection.path.length - 2]);

        this.selection = {
          type: 'node',
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
  // IMPORTANT: Leaf nodes must go first, branches second and the root node (entry point) last (depth-first traversal)
  // NOTE: Nodes that are not reachable from the entry point node will not be included in the serialization
  traverse(node_id) {
    const json = [];
    const visited = {};
    const visit = (node) => {
      if (!node || visited[node.id]) {
        return;
      }
      visited[node.id] = true;
      for (const [key, value] of Object.entries(node)) {
        // TODO: Use schema inspection and do this only for properties of type `node_array`
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
    // Start with the root node (document_id)
    visit($state.snapshot(this.get(node_id)));
    return json;
  }

  to_json(node_id) {
    return this.traverse(this.document_id);
  }

  // property_type('page', 'body') => 'node_array'
  // property_type('paragraph', 'content') => 'annotated_text'
  property_type(type, property) {
    if (typeof type !== 'string') throw new Error(`Invalid type ${type} provided`);
    if (typeof property !== 'string') throw new Error(`Invalid property ${property} provided`);
    // NOTE: Not sure if we should treat type and id as properties
    if (property === 'type') return 'string';
    if (property === 'id') return 'string';

    if (!this.schema[type]) throw new Error(`Type ${type} not found in schema`);
    if (!this.schema[type][property]) throw new Error(`Property ${property} not found in type ${type}`);

    return this.schema[type][property].type;
  }

  // Count how many times a node is referenced in the document
  count_references(node_id) {
    let count = 0;

    for (const node of Object.values(this.nodes)) {
      for (const [property, value] of Object.entries(node)) {
        if (property === 'id' || property === 'type') continue;

        const prop_type = this.property_type(node.type, property);

        if (prop_type === 'node_array' && Array.isArray(value)) {
          count += value.filter(id => id === node_id).length;
        } else if (prop_type === 'node' && value === node_id) {
          count += 1;
        }
      }
    }

    return count;
  }

  // Get all nodes referenced by a given node (recursively)
  get_referenced_nodes(node_id, visited = new Set()) {
    if (visited.has(node_id)) return [];
    visited.add(node_id);

    const node = this.nodes[node_id];
    if (!node) return [];

    const referenced = [];

    for (const [property, value] of Object.entries(node)) {
      if (property === 'id' || property === 'type') continue;

      const prop_type = this.property_type(node.type, property);

      if (prop_type === 'node_array' && Array.isArray(value)) {
        for (const ref_id of value) {
          referenced.push(ref_id);
          referenced.push(...this.get_referenced_nodes(ref_id, visited));
        }
      } else if (prop_type === 'node' && typeof value === 'string') {
        referenced.push(value);
        referenced.push(...this.get_referenced_nodes(value, visited));
      }
    }

    return referenced;
  }
}
