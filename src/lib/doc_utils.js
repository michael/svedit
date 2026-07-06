/**
 * Shared document utilities used by both Session and Transaction.
 *
 * These functions operate on the core document state (schema, doc, selection, config)
 * without any history management or transaction tracking.
 *
 * @import { NodeId, DocumentPath, PrimitiveType, NodeProperty, NodeArrayProperty, NodeSchema, DocumentSchema, Selection, Attachment, Mark, Annotation, Document, TextProperty, AnnotatedText, ValidateDocumentSchema } from './types'
 */

import {
	assert_path_string_segment,
	is_path_string_segment_valid,
	get_selection_range,
	get_char_length,
	serialize_path,
	are_ranges_exclusive
} from './utils.js';

/**
 * Identity function — keeps schema at runtime & makes IDE infer types.
 * Similar to your define_schema pattern but for document schemas.
 *
 * @template {Record<string, NodeSchema>} S
 * @param {S & ValidateDocumentSchema<S>} schema - The document schema to validate
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
		'text',
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
 * @param {import('./types').PropertyDefinition} property_definition
 * @returns {any}
 */
export function get_property_default(property_definition) {
	if ('default' in property_definition) return structuredClone(property_definition.default);

	if (property_definition.type === 'string') return '';
	if (property_definition.type === 'integer') return 0;
	if (property_definition.type === 'number') return 0;
	if (property_definition.type === 'boolean') return false;
	if (property_definition.type === 'text') return { content: '', marks: [], annotations: [] };
	if (property_definition.type === 'node_array') return { nodes: [], marks: [], annotations: [] };
	if (
		property_definition.type === 'string_array' ||
		property_definition.type === 'number_array' ||
		property_definition.type === 'boolean_array' ||
		property_definition.type === 'integer_array'
	) {
		return [];
	}

	return undefined;
}

export function get_node_array_nodes(value) {
	return value?.nodes ?? [];
}

export function get_node_array_marks(value) {
	return value?.marks ?? [];
}

export function get_node_array_annotations(value) {
	return value?.annotations ?? [];
}

/**
 * Fill omitted properties with schema defaults and Svedit's built-in type defaults.
 *
 * This is a convenience helper for schema evolution, not a complete document
 * migration system. Callers are still responsible for proper migrations when
 * schema changes cannot be represented by defaults, such as property renames or
 * data transformations.
 *
 * @param {any} node - The node to fill defaults for
 * @param {DocumentSchema} schema - The document schema
 * @returns {any} A shallow copy of the node with cloned default values filled in
 */
export function fill_node_defaults(node, schema) {
	const node_schema = schema[node.type];
	if (!node_schema) return { ...node };

	const node_with_defaults = { ...node };

	for (const [property_name, property_definition] of Object.entries(node_schema.properties)) {
		if (node_with_defaults[property_name] === undefined) {
			const property_default = get_property_default(property_definition);
			if (property_default !== undefined) node_with_defaults[property_name] = property_default;
		}
	}

	return node_with_defaults;
}

/**
 * Fill omitted properties with schema defaults and Svedit's built-in type defaults across a document.
 *
 * This does not infer values, rename fields, or make an invalid migration valid
 * by itself. Call this as one step in an explicit document migration when it is
 * appropriate.
 *
 * @param {Document} doc - The document to fill defaults for
 * @param {DocumentSchema} schema - The document schema
 * @returns {Document} A document copy with cloned default values filled in
 */
export function fill_document_defaults(doc, schema) {
	/** @type {Record<string, any>} */
	const nodes = {};

	for (const [node_id, node] of Object.entries(doc.nodes)) {
		nodes[node_id] = fill_node_defaults(node, schema);
	}

	return {
		...doc,
		nodes
	};
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
			assert_path_string_segment(prop_name, `Property name "${prop_name}"`);
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
			if (prop_def.type === 'text' || prop_def.type === 'node_array') {
				// mark_types must reference kind 'mark', annotation_types kind 'annotation'
				for (const [key, expected_kind] of [
					['mark_types', 'mark'],
					['annotation_types', 'annotation']
				]) {
					const invalid_types = (prop_def[key] ?? []).filter(
						(ref_type) => document_schema[ref_type]?.kind !== expected_kind
					);
					if (invalid_types.length > 0) {
						throw new Error(
							`Node type "${node_type}" property "${prop_name}" ${key} must reference node types of kind '${expected_kind}', got: ${invalid_types.join(', ')}.`
						);
					}
				}
			}
		}
	}
}

/**
 * Validate that no annotation node type has a registered component.
 *
 * Marks render in-place via components; annotations are data-only overlay
 * ranges that must be interpreted by the app (via CSS classes or props).
 *
 * @param {DocumentSchema} schema - The document schema
 * @param {any} config - The Svedit config
 * @throws {Error} Throws if a kind 'annotation' type has a registered component
 */
export function validate_config_components(schema, config) {
	for (const [node_type, node_schema] of Object.entries(schema)) {
		if (node_schema.kind === 'annotation' && config?.node_components?.[node_type]) {
			throw new Error(
				`Annotation type "${node_type}" must not have a registered component. Annotations are data-only; use kind 'mark' for in-place rendered ranges.`
			);
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
		case 'text':
			return (
				typeof value === 'object' &&
				value !== null &&
				typeof value.content === 'string' &&
				Array.isArray(value.marks) &&
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
 * Validate ranges (marks or annotations) for bounds, references, and allowed types.
 *
 * @param {string} node_id - Owner node id, used for error messages
 * @param {string} prop_name - Owner property name, used for error messages
 * @param {'mark' | 'annotation'} label - Range label, used for error messages
 * @param {Array<Attachment>} ranges - Ranges to validate
 * @param {number} container_length - Length of the annotated text or node array
 * @param {Array<string> | null | undefined} allowed_types - Allowed node types
 * @param {Record<string, any>} all_nodes - All document nodes
 * @param {boolean} require_references - Whether referenced nodes must already exist
 * @throws {Error} Throws if ranges are invalid
 */
function validate_range_array(
	node_id,
	prop_name,
	label,
	ranges,
	container_length,
	allowed_types,
	all_nodes,
	require_references
) {
	for (const [index, range] of ranges.entries()) {
		if (
			typeof range !== 'object' ||
			range === null ||
			!Number.isInteger(range.start_offset) ||
			!Number.isInteger(range.end_offset) ||
			!is_id_valid(range.node_id)
		) {
			throw new Error(
				`Node ${node_id} property ${prop_name} has an invalid ${label} at index ${index}. Ranges must have integer start_offset/end_offset and a valid node_id.`
			);
		}

		if (range.start_offset < 0 || range.end_offset > container_length) {
			throw new Error(
				`Node ${node_id} property ${prop_name} ${label} ${range.node_id} is out of bounds: ${range.start_offset}-${range.end_offset}, container length is ${container_length}.`
			);
		}

		if (range.start_offset >= range.end_offset) {
			throw new Error(
				`Node ${node_id} property ${prop_name} ${label} ${range.node_id} must not be empty or reversed: ${range.start_offset}-${range.end_offset}.`
			);
		}

		const referenced_node = all_nodes[range.node_id];
		if (!referenced_node) {
			if (require_references) {
				throw new Error(
					`Node ${node_id} property ${prop_name} ${label} references missing node ${range.node_id}.`
				);
			}
			continue;
		}

		if (allowed_types?.length && !allowed_types.includes(referenced_node.type)) {
			throw new Error(
				`Node ${node_id} property ${prop_name} ${label} references node ${range.node_id} of type ${referenced_node.type}, but only types [${allowed_types.join(', ')}] are allowed.`
			);
		}
	}
}

/**
 * Validate marks and annotations of an annotated container (text or node array).
 *
 * Marks must be mutually exclusive; annotations may overlap.
 *
 * @param {string} node_id - Owner node id, used for error messages
 * @param {string} prop_name - Owner property name, used for error messages
 * @param {{ marks: Array<Mark>, annotations: Array<Annotation> }} value - Annotated value to validate
 * @param {{ mark_types?: string[], annotation_types?: string[] }} prop_def - Property definition
 * @param {number} container_length - Length of the annotated text or node array
 * @param {Record<string, any>} all_nodes - All document nodes
 * @param {boolean} require_references - Whether referenced nodes must already exist
 * @throws {Error} Throws if marks or annotations are invalid
 */
function validate_marks_and_annotations(
	node_id,
	prop_name,
	value,
	prop_def,
	container_length,
	all_nodes,
	require_references
) {
	validate_range_array(
		node_id,
		prop_name,
		'mark',
		value.marks,
		container_length,
		prop_def.mark_types,
		all_nodes,
		require_references
	);

	if (!are_ranges_exclusive(value.marks, container_length)) {
		throw new Error(
			`Node ${node_id} property ${prop_name} has overlapping marks. Marks must be mutually exclusive.`
		);
	}

	validate_range_array(
		node_id,
		prop_name,
		'annotation',
		value.annotations,
		container_length,
		prop_def.annotation_types,
		all_nodes,
		require_references
	);
}

/**
 * Validate text property marks and annotations for bounds, references, allowed
 * types, and mark exclusivity.
 *
 * @param {string} node_id - Owner node id, used for error messages
 * @param {string} prop_name - Owner property name, used for error messages
 * @param {AnnotatedText} value - Annotated text value to validate
 * @param {TextProperty} prop_def - Text property definition
 * @param {Record<string, any>} all_nodes - All document nodes
 * @param {boolean} require_references - Whether referenced nodes must already exist
 * @throws {Error} Throws if marks or annotations are invalid
 */
function validate_text_property(
	node_id,
	prop_name,
	value,
	prop_def,
	all_nodes,
	require_references
) {
	const char_length = get_char_length(value.content);
	validate_marks_and_annotations(
		node_id,
		prop_name,
		value,
		prop_def,
		char_length,
		all_nodes,
		require_references
	);
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function is_id_valid(id) {
	return typeof id === 'string' && id.length > 0 && is_path_string_segment_valid(id);
}

/**
 * Validate a node against its schema.
 * @param {any} node - The node to validate
 * @param {DocumentSchema} schema - The document schema
 * @param {Record<string, any>} all_nodes - All nodes in the document to check references
 * @param {{ require_references?: boolean }} [options] - Validation options
 * @throws {Error} Throws if the node is invalid
 */
export function validate_node(node, schema, all_nodes = {}, options = {}) {
	const require_references = options.require_references ?? true;
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
		if (prop_def.type === 'text') {
			validate_text_property(
				node.id,
				prop_name,
				value,
				/** @type {TextProperty} */ (prop_def),
				all_nodes,
				require_references
			);
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
			if (!referenced_node) {
				if (require_references) {
					throw new Error(
						`Node ${node.id} property ${prop_name} references missing node ${value}.`
					);
				}
				continue;
			}
			if (!prop_def.node_types.includes(referenced_node.type)) {
				throw new Error(
					`Node ${node.id} property ${prop_name} references node ${value} of type ${referenced_node.type}, but only types [${/** @type {NodeProperty} */ (prop_def).node_types.join(', ')}] are allowed.`
				);
			}
		}
		// Check node arrays
		else if (prop_def.type === 'node_array') {
			if (
				!value ||
				typeof value !== 'object' ||
				!Array.isArray(value.nodes) ||
				!Array.isArray(value.marks) ||
				!Array.isArray(value.annotations)
			) {
				throw new Error(
					`Node ${node.id} has an invalid property: ${prop_name} must be an object with nodes, marks and annotations.`
				);
			}

			const node_array_nodes = value.nodes;

			if (!node_array_nodes.every((id) => typeof id === 'string' && is_id_valid(id))) {
				throw new Error(
					`Node ${node.id} has an invalid property: ${prop_name} must contain valid node ids.`
				);
			}

			// Check if all referenced nodes exist and are of allowed types
			for (const ref_id of node_array_nodes) {
				const referenced_node = all_nodes[ref_id];
				if (!referenced_node) {
					if (require_references) {
						throw new Error(
							`Node ${node.id} property ${prop_name} references missing node ${ref_id}.`
						);
					}
					continue;
				}
				if (!prop_def.node_types.includes(referenced_node.type)) {
					throw new Error(
						`Node ${node.id} property ${prop_name} references node ${ref_id} of type ${referenced_node.type}, but only types [${prop_def.node_types.join(', ')}] are allowed.`
					);
				}
			}
			validate_marks_and_annotations(
				node.id,
				prop_name,
				value,
				prop_def,
				node_array_nodes.length,
				all_nodes,
				require_references
			);
		}
	}
}

/**
 * Validate a document against its schema.
 *
 * @param {Document} doc - The document to validate
 * @param {DocumentSchema} schema - The document schema
 * @throws {Error} Throws if the document is invalid
 */
export function validate_document(doc, schema) {
	if (!is_id_valid(doc.document_id)) {
		throw new Error(`Document ${doc.document_id} has an invalid id.`);
	}
	for (const [node_id, node] of Object.entries(doc.nodes)) {
		if (!is_id_valid(node_id)) {
			throw new Error(`Document node map contains an invalid id: ${node_id}.`);
		}
		if (node.id !== node_id) {
			throw new Error(`Document node map key ${node_id} does not match node id ${node.id}.`);
		}
		validate_node(node, schema, doc.nodes);
	}
}

/**
 * Gets a value from the document at the specified path.
 *
 * @param {DocumentSchema} schema - The document schema
 * @param {Document} doc - The document containing nodes
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
			} else if (property_type(schema, val.type, path_segment_str) === 'text') {
				val = val[path_segment];
				val_type = 'text';
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
			if (path_segment === 'nodes') {
				val = get_node_array_nodes(val);
				val_type = 'node_id_array';
			} else if (path_segment === 'marks') {
				val = get_node_array_marks(val);
				val_type = 'range_array';
			} else if (path_segment === 'annotations') {
				val = get_node_array_annotations(val);
				val_type = 'range_array';
			} else if (typeof path_segment === 'number' || /^\d+$/.test(String(path_segment))) {
				val = doc.nodes[val.nodes[path_segment]];
				val_type = 'node';
			} else {
				throw new Error(
					`Invalid path segment "${path_segment}" for node_array. Use "nodes", "marks" or "annotations".`
				);
			}
		} else if (val_type === 'node_id_array') {
			val = doc.nodes[val[path_segment]];
			val_type = 'node';
		} else if (val_type === 'value_array') {
			val = val[path_segment];
			val_type = 'value';
		} else if (val_type === 'text') {
			if (path_segment === 'content') {
				val = val.content;
				val_type = 'value';
			} else if (path_segment === 'marks') {
				val = val.marks;
				val_type = 'range_array';
			} else if (path_segment === 'annotations') {
				val = val.annotations;
				val_type = 'range_array';
			} else {
				throw new Error(
					`Invalid path segment "${path_segment}" for text. Use "content", "marks" or "annotations".`
				);
			}
		} else if (val_type === 'range_array') {
			val = val[path_segment];
			val_type = 'range';
		} else if (val_type === 'range') {
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
					`Invalid path segment "${path_segment}" for range. Use "start_offset", "end_offset", or "node_id".`
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
 * Determines the kind of a node ('block', 'text', 'mark', or 'annotation').
 *
 * @param {object} schema - The document schema
 * @param {any} node - The node to check
 * @returns {'block'|'text'|'mark'|'annotation'} The node kind
 */
export function kind(schema, node) {
	return schema[node.type].kind;
}

/**
 * Inspects a path to get metadata about the value at that location.
 *
 * @param {DocumentSchema} schema - The document schema
 * @param {Document} doc - The document containing nodes
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
 * @param {Document} doc - The document to apply the operation to
 * @param {Array} op - The operation to apply [type, ...args]
 * @returns {Document} The new document with the operation applied
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
 * @param {DocumentSchema} schema - The document schema
 * @param {Document} doc - The document containing nodes
 * @param {NodeId} node_id - The node ID to count references for
 * @returns {number} The number of references
 */
export function count_references(schema, doc, node_id) {
	let count = 0;

	for (const node of Object.values(doc.nodes)) {
		for (const [property, value] of Object.entries(node)) {
			if (property === 'id' || property === 'type') continue;

			const prop_type = property_type(schema, node.type, property);

			if (prop_type === 'node_array') {
				count += get_node_array_nodes(value).filter((id) => id === node_id).length;
				count += get_node_array_marks(value).filter((m) => m.node_id === node_id).length;
				count += get_node_array_annotations(value).filter((a) => a.node_id === node_id).length;
			} else if (prop_type === 'node' && value === node_id) {
				count += 1;
			}
		}
	}

	return count;
}

/**
 * @param {DocumentSchema} schema - The document schema
 * @param {string} from_type - Current mark type
 * @param {string} to_type - Target mark type
 * @returns {boolean} Whether a mark can be switched between these types
 */
export function can_switch_mark_type(schema, from_type, to_type) {
	const from_schema = schema[from_type];
	const to_schema = schema[to_type];
	return (
		from_schema?.kind === 'mark' &&
		to_schema?.kind === 'mark' &&
		Object.keys(from_schema.properties ?? {}).length === 0 &&
		Object.keys(to_schema.properties ?? {}).length === 0
	);
}

/**
 * Gets ranges of the given key ('marks' or 'annotations') touched by the
 * current selection.
 *
 * Non-collapsed selections use strict half-open range intersection, so merely
 * adjacent boundaries do not count as touching. Collapsed text carets are only
 * inside a range when they are strictly between start and end; a caret at
 * either boundary is not active.
 *
 * @param {DocumentSchema} schema - The document schema
 * @param {Document} doc - The document containing nodes
 * @param {Selection | null | undefined} selection - The current selection
 * @param {'marks' | 'annotations'} key - Which range array to inspect
 * @returns {(Attachment & { index: number, node: any })[]} Selected attachment records
 */
function get_selected_ranges(schema, doc, selection, key) {
	if (selection?.type !== 'text' && selection?.type !== 'node') return [];
	const range = get_selection_range(selection);
	if (!range) return [];

	const annotated_prop = get(schema, doc, selection.path);
	const ranges = annotated_prop?.[key] ?? [];
	const is_collapsed = range.start_offset === range.end_offset;

	return ranges
		.map((/** @type {Attachment} */ attachment, index) => {
			const node = doc.nodes[attachment.node_id];
			return {
				...attachment,
				index,
				node
			};
		})
		.filter(({ start_offset, end_offset }) => {
			if (is_collapsed) {
				return start_offset < range.start_offset && end_offset > range.start_offset;
			}
			return start_offset < range.end_offset && end_offset > range.start_offset;
		});
}

/**
 * Gets marks touched by the current selection.
 *
 * @param {DocumentSchema} schema - The document schema
 * @param {Document} doc - The document containing nodes
 * @param {Selection} [selection] - The current selection
 * @returns {(Mark & { index: number, node: any })[]} Selected mark records
 */
export function get_selected_marks(schema, doc, selection) {
	return get_selected_ranges(schema, doc, selection, 'marks');
}

/**
 * Gets annotations touched by the current selection.
 *
 * @param {DocumentSchema} schema - The document schema
 * @param {Document} doc - The document containing nodes
 * @param {Selection} [selection] - The current selection
 * @returns {(Annotation & { index: number, node: any })[]} Selected annotation records
 */
export function get_selected_annotations(schema, doc, selection) {
	return get_selected_ranges(schema, doc, selection, 'annotations');
}

/**
 * @param {(Attachment & { index: number, node: any })[]} selected_ranges
 * @returns {Set<string>} Node types represented in the selected ranges
 */
export function get_selected_range_types(selected_ranges) {
	return new Set(selected_ranges.map(({ node }) => node?.type).filter(Boolean));
}

/**
 * Counts references to a node, excluding nodes marked for deletion.
 *
 * @param {DocumentSchema} schema - The document schema
 * @param {Document} doc - The document containing nodes
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

			if (prop_type === 'node_array') {
				count += get_node_array_nodes(value).filter((id) => id === target_node_id).length;
				count += get_node_array_marks(value).filter((m) => m.node_id === target_node_id).length;
				count += get_node_array_annotations(value).filter(
					(a) => a.node_id === target_node_id
				).length;
			} else if (prop_type === 'node' && value === target_node_id) {
				count += 1;
			} else if (prop_type === 'text' && value) {
				count += [...(value.marks ?? []), ...(value.annotations ?? [])].filter(
					(range) => range.node_id === target_node_id
				).length;
			}
		}
	}

	return count;
}

/**
 * Gets ids of nodes that reference any of the target nodes.
 *
 * @param {DocumentSchema} schema - The document schema
 * @param {Document} doc - The document containing nodes
 * @param {Iterable<NodeId>} target_node_ids - Node IDs to find referrers for
 * @returns {NodeId[]} IDs of nodes with references to any target node
 */
export function get_referencing_node_ids(schema, doc, target_node_ids) {
	const target_ids = new Set(target_node_ids);
	const referencing_node_ids = new Set();
	if (target_ids.size === 0) return [];

	for (const node of Object.values(doc.nodes)) {
		for (const [property, value] of Object.entries(node)) {
			if (property === 'id' || property === 'type') continue;

			const prop_type = property_type(schema, node.type, property);

			if (prop_type === 'node_array') {
				if (get_node_array_nodes(value).some((id) => target_ids.has(id))) {
					referencing_node_ids.add(node.id);
				} else if (
					[...get_node_array_marks(value), ...get_node_array_annotations(value)].some((range) =>
						target_ids.has(range.node_id)
					)
				) {
					referencing_node_ids.add(node.id);
				}
			} else if (prop_type === 'node' && target_ids.has(value)) {
				referencing_node_ids.add(node.id);
			} else if (prop_type === 'text' && value) {
				if (
					[...(value.marks ?? []), ...(value.annotations ?? [])].some((range) =>
						target_ids.has(range.node_id)
					)
				) {
					referencing_node_ids.add(node.id);
				}
			}
		}
	}

	return [...referencing_node_ids];
}

/**
 * Validates a selection against the current document state.
 * Works with any object that implements get() and inspect() (Session or Transaction).
 *
 * @param {Selection} selection - The selection to validate
 * @param {{ get: Function, inspect: Function }} session_or_transaction - A Session or Transaction instance
 * @throws {Error} Throws if the selection is invalid
 */
export function validate_selection(selection, session_or_transaction) {
	if (!selection) return;

	const selection_type = selection.type;
	if (!['node', 'text', 'property'].includes(selection_type)) {
		throw new Error(`Invalid selection type: ${selection_type}`);
	}

	if (selection_type === 'node') {
		const node_array_prop = session_or_transaction.get(selection.path);

		const node_array_nodes = get_node_array_nodes(node_array_prop);

		if (!node_array_prop || !Array.isArray(node_array_prop.nodes)) {
			throw new Error('Node selection path must point to a node_array');
		}

		const max_offset = node_array_nodes.length;
		if (selection.anchor_offset < 0 || selection.anchor_offset > max_offset) {
			throw new Error(
				`Node selection anchor_offset (${selection.anchor_offset}) is out of bounds. Max is ${max_offset}.`
			);
		}
		if (selection.focus_offset < 0 || selection.focus_offset > max_offset) {
			throw new Error(
				`Node selection focus_offset (${selection.focus_offset}) is out of bounds. Max is ${max_offset}.`
			);
		}
	} else if (selection_type === 'text') {
		const text = session_or_transaction.get(selection.path);

		if (!text || typeof text.content !== 'string') {
			throw new Error('Text selection path must point to text');
		}

		const char_length = get_char_length(text.content);
		if (selection.anchor_offset < 0 || selection.anchor_offset > char_length) {
			throw new Error(
				`Text selection anchor_offset (${selection.anchor_offset}) is out of bounds. Max is ${char_length}.`
			);
		}
		if (selection.focus_offset < 0 || selection.focus_offset > char_length) {
			throw new Error(
				`Text selection focus_offset (${selection.focus_offset}) is out of bounds. Max is ${char_length}.`
			);
		}
	} else if (selection_type === 'property') {
		if (!session_or_transaction.inspect(selection.path)) {
			throw new Error(`Property selection path not found: ${serialize_path(selection.path)}`);
		}
	}
}
