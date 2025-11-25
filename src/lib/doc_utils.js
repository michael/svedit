/**
 * Shared document utilities used by both Session and Transaction.
 *
 * These functions operate on the core document state (schema, doc, selection, config)
 * without any history management or transaction tracking.
 *
 * @import { NodeId, Selection, DocumentPath, PrimitiveType, NodeProperty, NodeArrayProperty, NodeSchema, DocumentSchema } from './types.js'
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
		'string',
		'number',
		'boolean',
		'integer',
		'datetime',
		'annotated_text',
		'string_array',
		'number_array',
		'boolean_array',
		'integer_array'
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

	return (
		property_definition.default_node_type ||
		(property_definition.node_types.length === 1 ? property_definition.node_types[0] : null)
	);
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
				const missing_types = prop_def.node_types.filter(
					(ref_type) => !(ref_type in document_schema)
				);
				if (missing_types.length > 0) {
					throw new Error(
						`Node type "${node_type}" property "${prop_name}" references unknown node types: ${missing_types.join(', ')}. Available node types: ${Object.keys(document_schema).join(', ')}`
					);
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
		case 'annotated_text':
			return (
				typeof value === 'object' &&
				value !== null &&
				typeof value.text === 'string' &&
				Array.isArray(value.annotations)
			);
		case 'string_array':
			return Array.isArray(value) && value.every((v) => typeof v === 'string');
		case 'number_array':
			return Array.isArray(value) && value.every((v) => typeof v === 'number' && !isNaN(v));
		case 'boolean_array':
			return Array.isArray(value) && value.every((v) => typeof v === 'boolean');
		case 'integer_array':
			return Array.isArray(value) && value.every((v) => Number.isInteger(v));
		default:
			return false;
	}
}

/**
 * @param {String} id
 * @returns {boolean}
 */
function is_id_valid(id) {
	return typeof id === 'string' && id.length > 0;
}

/**
 * Validate a node against its schema.
 * @param {any} node - The node to validate
 * @param {DocumentSchema} schema - The document schema
 * @param {Record<string, any>} all_nodes - All nodes in the document to check references
 * @throws {Error} Throws if the node is invalid
 */
export function validate_node(node, schema, all_nodes = {}) {
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
				throw new Error(
					`Node ${node.id} has an invalid property: ${prop_name} must be of type ${prop_def.type}.`
				);
			}
		}
		// Check node references
		if (prop_def.type === 'node') {
			if (!is_id_valid(value)) {
				throw new Error(
					`Node ${node.id} has an invalid property: ${prop_name} must be a valid node id.`
				);
			}
			// Check if referenced node exists and is of allowed type
			const referenced_node = all_nodes[value];
			if (referenced_node && !prop_def.node_types.includes(referenced_node.type)) {
				throw new Error(
					`Node ${node.id} property ${prop_name} references node ${value} of type ${referenced_node.type}, but only types [${/** @type {NodeProperty} */ (prop_def).node_types.join(', ')}] are allowed.`
				);
			}
		}
		// Check node arrays
		else if (prop_def.type === 'node_array') {
			if (
				!Array.isArray(value) ||
				!value.every((id) => typeof id === 'string' && is_id_valid(id))
			) {
				throw new Error(
					`Node ${node.id} has an invalid property: ${prop_name} must be an array of node ids.`
				);
			}
			// Check if all referenced nodes are of allowed types
			for (const ref_id of value) {
				const referenced_node = all_nodes[ref_id];
				if (referenced_node && !prop_def.node_types.includes(referenced_node.type)) {
					throw new Error(
						`Node ${node.id} property ${prop_name} references node ${ref_id} of type ${referenced_node.type}, but only types [${prop_def.node_types.join(', ')}] are allowed.`
					);
				}
			}
		}
	}
}

/**
 * Gets a value from the document at the specified path.
 *
 * @param {object} schema - The document schema
 * @param {object} doc - The document containing nodes
 * @param {DocumentPath|string} path - Array path to the value, or a string node ID
 * @returns {any} The value at the specified path
 */
export function get(schema, doc, path) {
	if (typeof path === 'string') {
		path = [path];
	}
	if (!(Array.isArray(path) && path.length >= 1)) {
		throw new Error(`Invalid path provided ${JSON.stringify(path)}`);
	}

	let val = doc.nodes[path[0]];
	let val_type = 'node';

	for (let i = 1; i < path.length; i++) {
		const path_segment = path[i];
		const path_segment_str = String(path_segment);
		if (val_type === 'node') {
			if (property_type(schema, val.type, path_segment_str) === 'node_array') {
				val = val[path_segment];
				val_type = 'node_array';
			} else if (property_type(schema, val.type, path_segment_str) === 'annotated_text') {
				val = val[path_segment];
				val_type = 'annotated_text';
			} else if (property_type(schema, val.type, path_segment_str) === 'node') {
				val = doc.nodes[val[path_segment]];
				val_type = 'node';
			} else if (
				['string_array', 'integer_array'].includes(
					property_type(schema, val.type, path_segment_str)
				)
			) {
				val = val[path_segment];
				val_type = 'value_array';
			} else {
				val = val[path_segment];
				val_type = 'value';
			}
		} else if (val_type === 'node_array') {
			val = doc.nodes[val[path_segment]];
			val_type = 'node';
		} else if (val_type === 'value_array') {
			val = val[path_segment];
			val_type = 'value';
		} else if (val_type === 'annotated_text') {
			if (path_segment === 'text') {
				val = val.text;
				val_type = 'value';
			} else if (path_segment === 'annotations') {
				val = val.annotations;
				val_type = 'annotation_array';
			} else {
				throw new Error(
					`Invalid path segment "${path_segment}" for annotated_text. Use "text" or "annotations".`
				);
			}
		} else if (val_type === 'annotation_array') {
			val = val[path_segment];
			val_type = 'annotation';
		} else if (val_type === 'annotation') {
			if (path_segment === 'node_id') {
				val = doc.nodes[val.node_id];
				val_type = 'node';
			} else if (path_segment === 'start_offset') {
				val = val.start_offset;
				val_type = 'value';
			} else if (path_segment === 'end_offset') {
				val = val.end_offset;
				val_type = 'value';
			} else {
				throw new Error(
					`Invalid path segment "${path_segment}" for annotation. Use "start_offset", "end_offset", or "node_id".`
				);
			}
		}
	}
	return val;
}

/**
 * Gets the type of a property from the schema.
 *
 * @param {object} schema - The document schema
 * @param {string} type - The node type
 * @param {string} property - The property name
 * @returns {string} The property type
 */
export function property_type(schema, type, property) {
	if (typeof type !== 'string') throw new Error(`Invalid type ${type} provided`);
	if (typeof property !== 'string') throw new Error(`Invalid property ${property} provided`);

	if (property === 'type') return 'string';
	if (property === 'id') return 'string';

	if (!schema[type]) throw new Error(`Type ${type} not found in schema`);
	if (!schema[type].properties[property])
		throw new Error(`Property ${property} not found in type ${type}`);

	return schema[type].properties[property].type;
}

/**
 * Determines the kind of a node ('block', 'text', or 'annotation').
 *
 * @param {object} schema - The document schema
 * @param {any} node - The node to check
 * @returns {'block'|'text'|'annotation'} The node kind
 */
export function kind(schema, node) {
	return schema[node.type].kind;
}

/**
 * Inspects a path to get metadata about the value at that location.
 *
 * @param {object} schema - The document schema
 * @param {object} doc - The document containing nodes
 * @param {DocumentPath} path - The path to inspect
 * @returns {{kind: 'property'|'node', [key: string]: any}} Metadata about the path
 */
export function inspect(schema, doc, path) {
	const parent = path.length > 1 ? get(schema, doc, path.slice(0, -1)) : undefined;
	if (parent?.type) {
		const property_name = path.at(-1);
		return {
			kind: 'property',
			name: property_name,
			...schema[parent.type].properties[property_name]
		};
	} else {
		const node = get(schema, doc, path);
		return {
			kind: 'node',
			id: node.id,
			type: node.type,
			properties: schema[node.type]
		};
	}
}

/**
 * Applies an operation to a document and returns the new document.
 * Uses copy-on-write semantics.
 *
 * @param {object} doc - The document to apply the operation to
 * @param {Array} op - The operation to apply [type, ...args]
 * @returns {object} The new document with the operation applied
 */
export function apply_op(doc, op) {
	const [type, ...args] = op;
	if (type === 'set') {
		const [node_id, property] = args[0];
		const value = structuredClone(args[1]);
		return {
			...doc,
			nodes: {
				...doc.nodes,
				[node_id]: {
					...doc.nodes[node_id],
					[property]: value
				}
			}
		};
	} else if (type === 'create') {
		return {
			...doc,
			nodes: {
				...doc.nodes,
				[args[0].id]: structuredClone(args[0])
			}
		};
	} else if (type === 'delete') {
		// eslint-disable-next-line
		const { [args[0]]: _removed, ...remaining_nodes } = doc.nodes;
		return {
			...doc,
			nodes: remaining_nodes
		};
	}
	return doc;
}

/**
 * Counts how many times a node is referenced in the document.
 *
 * @param {object} schema - The document schema
 * @param {object} doc - The document containing nodes
 * @param {NodeId} node_id - The node ID to count references for
 * @returns {number} The number of references
 */
export function count_references(schema, doc, node_id) {
	let count = 0;

	for (const node of Object.values(doc.nodes)) {
		for (const [property, value] of Object.entries(node)) {
			if (property === 'id' || property === 'type') continue;

			const prop_type = property_type(schema, node.type, property);

			if (prop_type === 'node_array' && Array.isArray(value)) {
				count += value.filter((id) => id === node_id).length;
			} else if (prop_type === 'node' && value === node_id) {
				count += 1;
			}
		}
	}

	return count;
}

/**
 * Counts references to a node, excluding nodes marked for deletion.
 *
 * @param {object} schema - The document schema
 * @param {object} doc - The document containing nodes
 * @param {NodeId} target_node_id - The node ID to count references for
 * @param {Record<NodeId, boolean>} nodes_to_delete - Nodes marked for deletion
 * @returns {number} The number of references excluding deleted nodes
 */
export function count_references_excluding_deleted(schema, doc, target_node_id, nodes_to_delete) {
	let count = 0;

	for (const node of Object.values(doc.nodes)) {
		if (nodes_to_delete[node.id]) continue;

		for (const [property, value] of Object.entries(node)) {
			if (property === 'id' || property === 'type') continue;

			const prop_type = property_type(schema, node.type, property);

			if (prop_type === 'node_array' && Array.isArray(value)) {
				count += value.filter((id) => id === target_node_id).length;
			} else if (prop_type === 'node' && value === target_node_id) {
				count += 1;
			} else if (prop_type === 'annotated_text' && value && value.annotations) {
				count += value.annotations.filter(
					(annotation) => annotation.node_id === target_node_id
				).length;
			}
		}
	}

	return count;
}
