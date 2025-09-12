import Transaction from './Transaction.svelte.js';
import { char_slice } from './util.js';

/**
 * @import {
 *   NodeId,
 *   DocumentPath,
 *   Selection,
 *   Annotation,
 *   PrimitiveType,
 *   DocumentSchemaPrimitive,
 *   NodeProperty,
 *   NodeArrayProperty,
 *   NodeKind,
 *   NodeSchema,
 *   TextNodeSchema,
 *   NonTextNodeSchema,
 *   DocumentSchema,
 *   SerializedDocument
 * } from './types.d.ts';
 */

/**
 * Identity function — keeps schema at runtime & makes IDE infer types.
 * Similar to your define_schema pattern but for document schemas.
 *
 * @template {Record<string, NodeSchema>} S
 * @param {S} schema - The document schema to validate
 * @returns {S} The same schema, but with type information preserved
 */
export function define_document_schema(schema) {
  return schema;
}

/**
 * Check if a string represents a valid primitive type.
 * @param {string} type - The type string to check
 * @returns {type is PrimitiveType} True if it's a valid primitive type
 */
export function is_primitive_type(type) {
  return [
    'string', 'number', 'boolean', 'integer', 'datetime',
    'annotated_string', 'string_array', 'number_array',
    'boolean_array', 'integer_array'
  ].includes(type);
}

/**
 * Get the default node type for a property that references nodes.
 * @param {NodeProperty | NodeArrayProperty} property_definition - The property definition
 * @returns {string | null} The default node type, or null if none specified
 */
export function get_default_node_type(property_definition) {
  if (!property_definition || !property_definition.node_types) {
    return null;
  }

  return property_definition.default_node_type ||
    (property_definition.node_types.length === 1 ? property_definition.node_types[0] : null);
}

/**
 * Validate a document schema to ensure all referenced node types exist.
 * @param {DocumentSchema} document_schema - The document schema to validate
 * @throws {Error} Throws if the document schema is invalid
 */
export function validate_document_schema(document_schema) {
  // Check that all referenced node types exist
  for (const [node_type, node_schema] of Object.entries(document_schema)) {
    for (const [prop_name, prop_def] of Object.entries(node_schema.properties)) {
      if (prop_def.type === 'node' || prop_def.type === 'node_array') {
        const missing_types = prop_def.node_types.filter(ref_type => !(ref_type in document_schema));
        if (missing_types.length > 0) {
          throw new Error(`Node type "${node_type}" property "${prop_name}" references unknown node types: ${missing_types.join(', ')}. Available node types: ${Object.keys(document_schema).join(', ')}`);
        }
      }
    }
  }
}

/**
 * Validate a primitive value against its schema type.
 * @param {PrimitiveType} type - The expected type
 * @param {any} value - The value to validate
 * @returns {boolean} True if the value matches the type
 */
function validate_primitive_value(type, value) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return Number.isInteger(value);
    case 'datetime':
      return typeof value === 'string' && !isNaN(Date.parse(value));
    case 'annotated_string':
      return Array.isArray(value) &&
             value.length === 2 &&
             typeof value[0] === 'string' &&
             Array.isArray(value[1]);
    case 'string_array':
      return Array.isArray(value) && value.every(v => typeof v === 'string');
    case 'number_array':
      return Array.isArray(value) && value.every(v => typeof v === 'number' && !isNaN(v));
    case 'boolean_array':
      return Array.isArray(value) && value.every(v => typeof v === 'boolean');
    case 'integer_array':
      return Array.isArray(value) && value.every(v => Number.isInteger(v));
    default:
      return false;
  }
}

/**
 * @param {String} id
 * @returns {boolean}
 */
function is_id_valid(id) {
  return typeof id === 'string' && id.length > 0
}

/**
 * Validate a node against its schema.
 * @param {any} node - The node to validate
 * @param {DocumentSchema} schema - The document schema
 * @param {Record<string, any>} all_nodes - All nodes in the document to check references
 * @throws {Error} Throws if the node is invalid
 */
function validate_node(node, schema, all_nodes = {}) {
  if (!is_id_valid(node.id)) {
    throw new Error(`Node ${node.id} has an invalid id.`);
  }

  if (!node.type || !schema[node.type]) {
    throw new Error(`Node ${node.id} has an invalid type: ${node.type}`);
  }

  const node_schema = schema[node.type];

  for (const [prop_name, prop_def] of Object.entries(node_schema.properties)) {
    const value = node[prop_name];

    // Check primitive types
    if (is_primitive_type(prop_def.type)) {
      if (!validate_primitive_value(prop_def.type, value)) {
        throw new Error(`Node ${node.id} has an invalid property: ${prop_name} must be of type ${prop_def.type}.`);
      }
    }
    // Check node references
    if (prop_def.type === 'node') {
      if (!is_id_valid(value)) {
        throw new Error(`Node ${node.id} has an invalid property: ${prop_name} must be a valid node id.`);
      }
      // Check if referenced node exists and is of allowed type
      const referenced_node = all_nodes[value];
      if (
        referenced_node &&
        !prop_def.node_types.includes(referenced_node.type)
      ) {
        throw new Error(`Node ${node.id} property ${prop_name} references node ${value} of type ${referenced_node.type}, but only types [${(/** @type {NodeProperty} */ (prop_def)).node_types.join(', ')}] are allowed.`);
      }
    }
    // Check node arrays
    else if (prop_def.type === 'node_array') {
      if (!Array.isArray(value) || !value.every(id => typeof id === 'string' && is_id_valid(id))) {
        throw new Error(`Node ${node.id} has an invalid property: ${prop_name} must be an array of node ids.`);
      }
      // Check if all referenced nodes are of allowed types
      for (const ref_id of value) {
        const referenced_node = all_nodes[ref_id];
        if (referenced_node && !prop_def.node_types.includes(referenced_node.type)) {
          throw new Error(`Node ${node.id} property ${prop_name} references node ${ref_id} of type ${referenced_node.type}, but only types [${prop_def.node_types.join(', ')}] are allowed.`);
        }
      }
    }
  }
}

export default class Document {
  /** @type {Selection | undefined} */
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
	layout_node = $derived(this.get_layout_node());
	available_annotation_types = $derived(this.get_available_annotation_types());

  /**
   * @param {DocumentSchema} schema - The document schema
   * @param {SerializedDocument} serialized_doc - The serialized document array
   * @param {object} [options] - Optional configuration
   * @param {Selection} [options.selection] - Initial selection state
   * @param {any} [options.config] - Document configuration
   */
  constructor(schema, serialized_doc, { selection, config } = {}) {
    // Validate the schema first
    validate_document_schema(schema);

    this.schema = schema;
    this.selection = selection;
    this.config = config;
    this.nodes = {};

    // Initialize and validate nodes one by one
    // This ensures references only point to already-loaded nodes
    for (const node of serialized_doc) {
      this.validate_node(node);
      this.nodes[node.id] = node;
    }

    // The last element in the serialized_doc is the document itself (the root node)
    this.document_id = serialized_doc.at(-1)?.id;
  }

  generate_id() {
    if (this.config.generate_id) {
      return this.config.generate_id();
    } else {
      return crypto.randomUUID();
    }
  }

 	get_available_annotation_types() {
    if (this.selection?.type !== 'text') return [];
    const path = this.selection.path;
    const property_schema = this.inspect(path);
    return property_schema.node_types || [];
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

	// NOTE: This code is a bit whacky, but works for now.
	// TODO: Refactor as we settle on a final API
	get_layout_node() {
    if (!this.selected_node) return null;

    // The selected node already is a layout node
    if (this.selected_node.layout) {
      return this.selected_node;
    }

    // We resolve the parent node if available, and return it if it's a layout node.
    // NOTE: We only support one level atm, we may want to implement this recursively
    if (this.selection.type === 'node') {
      const parent_node = this.get(this.selection.path.slice(0, -1));
      return parent_node.layout ? parent_node : null;
    } else {
      // We are either in a text or property (=custom) selection
      const parent_node_path = this.selection?.path?.slice(0, -3);
			if (!parent_node_path) return null;
			const parent_node = this.get(parent_node_path);
      return parent_node.layout ? parent_node : null;
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

  /**
   * Validate a node against the document schema.
   * @param {any} node - The node to validate
   * @throws {Error} Throws if the node is invalid
   */
  validate_node(node) {
    validate_node(node, this.schema, this.nodes);
  }

  /**
   * Creates a new transaction for making atomic changes to the document.
   *
   * @returns {Transaction} A new transaction instance
   */
  get tr() {
    // We create a copy of the current document to avoid modifying the original
    const transaction_doc = new Document(this.schema, this.to_json(), {
      config: this.config,
      selection: this.selection
    });
    return new Transaction(transaction_doc);
  }

  /**
   * Applies a transaction to the document.
   *
   * @param {Transaction} transaction - The transaction to apply
   */
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

  /**
   * Gets a node instance or property value at the specified path.
   * @param {DocumentPath|string} path - Path to the node or property
   * @returns {any} Either a node instance object or the value of a property
   * @example
   * // Get a node by ID
   * doc.get('list_1') // => { type: 'list', id: 'list_1', ... }
   *
   * @example
   * // Get a node array property
   * doc.get(['list_1', 'list_items']) // => [ 'list_item_1', 'list_item_2' ]
   *
   * @example
   * // Get a specific node from an array
   * doc.get(['page_1', 'body', 3, 'list_items', 0]) // => { type: 'list_item', id: 'list_item_1', ... }
   *
   * @example
   * // Get an annotated string property
   * doc.get(['page_1', 'cover', 'title']) // => ['Hello world', []]
   */
  get(path) {
    if (typeof path === 'string') {
      path = [ path ];
    }
    if (!(Array.isArray(path) && path.length >= 1)) {
      throw new Error(`Invalid path provided ${JSON.stringify(path)}`);
    }

    let val = this.nodes[path[0]];
    let val_type = 'node';

    for (let i = 1; i < path.length; i++) {
      const path_segment = path[i];
      if (val_type === 'node') {
        if (this.property_type(val.type, path_segment) === 'node_array') {
          val = val[path_segment]; // e.g. for the page body ['list_1', 'paragraph_1']
          val_type = 'node_array';
        } else if (this.property_type(val.type, path_segment) === 'annotated_string') {
          val = val[path_segment];
          val_type = 'annotated_string';
        } else if (this.property_type(val.type, path_segment) === 'node') {
          val = this.nodes[val[path_segment]];
          val_type = 'node';
        } else if (['string_array', 'integer_array'].includes(this.property_type(val.type, path_segment))) {
          val = val[path_segment];
          val_type = 'value_array';
        } else {
          // Resolve value properties such as string, integer, datetime
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
      } else if (val_type === 'annotated_string') {
        val = val[path_segment];
        if (path_segment == 1) {
          val_type = 'annotation_array';
        } else {
          val_type = 'value';
        }
      } else if (val_type === 'annotation_array') {
        val = val[path_segment];
        val_type = 'annotation';
      } else if (val_type === 'annotation') {
        // 2 is for addressing the node_id that points to the node that has all
        // annotation data (like the type and properties). In this case we
        // resolve the node, so we could further resolve the node's properties (e.g. type)
        if (path_segment == 2) {
          val = this.nodes[val[path_segment]];
          val_type = 'node';
        } else {
          // 0,1 are for addressing annotation_start / annotation_end
          val = val[path_segment];
          val_type = 'value';
        }
      }
    }
    return val;
  }

  /**
   * While .get gives you the value of a path, inspect gives you
   * the type info of that value.
   *
   * @todo The layout of these should be improved and more explictly typed
   *
   * @example
   * doc.inspect(['page_1', 'body']) => {
   *   kind: 'property',
   *   name: 'body',
   *   type: 'node_array',
   *   node_types: ['text', 'story', 'list'],
   *   default_node_type: 'text'
   * }
   *
   * @example
   * doc.inspect(['page_1', 'body', 1]) => {
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
    const parent = path.length > 1 ? this.get(path.slice(0, -1)) : undefined;
    if (parent?.type) {
      // Parent is a node, so we are dealing with a property.
      const property_name = path.at(-1);
      return  {
        kind: 'property',
        name: property_name,
        // Merge property spec from schema
        ...this.schema[parent.type].properties[property_name]
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

  /**
   * Determines the kind of a node ('block' for structured blocks, 'text' for pure
   * text nodes or 'annotation' for annotation nodes.
   * @param {any} node
   * @returns {NodeKind}
   */
  kind(node) {
    return this.schema[node.type].kind;
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

    const { start, end } = this.get_selection_range();
    const annotated_string = this.get(this.selection.path);
    const annotations = annotated_string[1];

    const active_annotation = annotations.find(([annotation_start, annotation_end]) =>
      (annotation_start <= start && annotation_end > start) ||
      (annotation_start < end && annotation_end >= end) ||
      (annotation_start >= start && annotation_end <= end)
    ) || null;

    if (annotation_type && active_annotation) {
      const annotation_node = this.get(active_annotation?.[2]);
      return annotation_node?.type === annotation_type ? active_annotation : null;
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
    return char_slice(annotated_string[0], start, end);
  }

  get_selected_nodes() {
    if (this.selection?.type !== 'node') return null;

    const start =   Math.min(this.selection.anchor_offset, this.selection.focus_offset);
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

  get_selection_range() {
    if (this.selection && this.selection.type !== 'property') {
      const start = Math.min(this.selection.anchor_offset, this.selection.focus_offset);
      const end = Math.max(this.selection.anchor_offset, this.selection.focus_offset);

      return {
        start,
        end,
        length: end - start
      };
    } else {
      return null;
    }
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
      for (const [property_name, value] of Object.entries(node)) {
        const property_schema = this.schema[node.type].properties[property_name];

        if (property_schema?.type === 'node_array') {
          for (const v of value) {
            if (typeof v === 'string') {
              visit($state.snapshot(this.get(v)));
            }
          }
        } else if (property_schema?.type === 'node') {
          visit($state.snapshot(this.get(value)));
        } else if (property_schema?.type === 'annotated_string') {
          for (const v of value[1]) {
            visit($state.snapshot(this.get(v[2])));
          }
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

  /**
   * Convert the document to serialized format.
   * @returns {SerializedDocument} The serialized document array
   */
  to_json() {
    return this.traverse(this.document_id);
  }

  // property_type('page', 'body') => 'node_array'
  // property_type('paragraph', 'content') => 'annotated_string'
  property_type(type, property) {
    if (typeof type !== 'string') throw new Error(`Invalid type ${type} provided`);
    if (typeof property !== 'string') throw new Error(`Invalid property ${property} provided`);
    // NOTE: Not sure if we should treat type and id as properties
    if (property === 'type') return 'string';
    if (property === 'id') return 'string';

    if (!this.schema[type]) throw new Error(`Type ${type} not found in schema`);
    if (!this.schema[type].properties[property]) throw new Error(`Property ${property} not found in type ${type}`);

    return this.schema[type].properties[property].type;
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
  /**
   * @param {NodeId} node_id
   * @returns {NodeId[]}
   */
  get_referenced_nodes(node_id) {
    const traversed_nodes = this.traverse(node_id);

    // Extract IDs and exclude the last element (root node)
    return traversed_nodes
      .slice(0, -1)
      .map(node => node.id);
  }
}
