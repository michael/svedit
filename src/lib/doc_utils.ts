/**
 * Shared document utilities used by both Session and Transaction.
 *
 * These functions operate on the core document state (schema, doc, selection, config)
 * without any history management or transaction tracking.
 */

import {
	assert_path_string_segment,
	is_path_string_segment_valid,
	get_selection_range,
	get_char_length,
	char_slice,
	adjust_ranges_for_deletion,
	adjust_ranges_for_insertion,
	serialize_path,
	are_ranges_exclusive
} from './utils.js';
import type {
	NodeId,
	DocumentPath,
	PrimitiveType,
	PropertyDefinition,
	NodeProperty,
	NodeArrayProperty,
	NodeSchema,
	NodeKind,
	DocumentSchema,
	Selection,
	Attachment,
	Mark,
	Annotation,
	Document,
	DocumentNode,
	TextProperty,
	Text,
	ValidateDocumentSchema,
	Inspection,
	DocumentOperation,
	SessionConfig
} from './types.js';

/**
 * Identity function — keeps schema at runtime & makes IDE infer types.
 * Similar to your define_schema pattern but for document schemas.
 */
export function define_document_schema<S extends Record<string, NodeSchema>>(
	schema: S & ValidateDocumentSchema<S>
): S {
	return schema;
}

/**
 * Check if a string represents a valid primitive type.
 */
export function is_primitive_type(type: string): type is PrimitiveType {
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
 * Returns null if none specified.
 */
export function get_default_node_type(
	property_definition: NodeProperty | NodeArrayProperty
): string | null {
	if (!property_definition || !property_definition.node_types) {
		return null;
	}

	return (
		property_definition.default_node_type ||
		(property_definition.node_types.length === 1 ? property_definition.node_types[0] : null)
	);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function get_property_default(property_definition: PropertyDefinition): any {
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

/**
 * Fill omitted properties with schema defaults and Svedit's built-in type defaults.
 *
 * This is a convenience helper for schema evolution, not a complete document
 * migration system. Callers are still responsible for proper migrations when
 * schema changes cannot be represented by defaults, such as property renames or
 * data transformations.
 *
 * @returns A shallow copy of the node with cloned default values filled in
 */
export function fill_node_defaults(node: DocumentNode, schema: DocumentSchema): DocumentNode {
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
 * @returns A document copy with cloned default values filled in
 */
export function fill_document_defaults(doc: Document, schema: DocumentSchema): Document {
	const nodes: Record<string, DocumentNode> = {};

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
 * @throws {Error} Throws if the document schema is invalid
 */
export function validate_document_schema(document_schema: DocumentSchema): void {
	// Check that all referenced node types exist
	for (const [node_type, node_schema] of Object.entries(document_schema)) {
		for (const [prop_name, prop_def] of Object.entries(node_schema.properties)) {
			assert_path_string_segment(prop_name, `Property name "${prop_name}"`);
			if (prop_def.type === 'string' && prop_def.values !== undefined) {
				if (
					!Array.isArray(prop_def.values) ||
					prop_def.values.some((value) => typeof value !== 'string')
				) {
					throw new Error(
						`Node type "${node_type}" property "${prop_name}" values must be an array of strings.`
					);
				}
				if (prop_def.values.length === 0) {
					throw new Error(
						`Node type "${node_type}" property "${prop_name}" values must not be empty.`
					);
				}
				if (new Set(prop_def.values).size !== prop_def.values.length) {
					throw new Error(
						`Node type "${node_type}" property "${prop_name}" values must be unique.`
					);
				}
				if (prop_def.default !== undefined && !prop_def.values.includes(prop_def.default)) {
					throw new Error(
						`Node type "${node_type}" property "${prop_name}" default must be one of its allowed values.`
					);
				}
			}
			if (prop_def.type === 'integer') {
				if (prop_def.default !== undefined && !Number.isInteger(prop_def.default)) {
					throw new Error(
						`Node type "${node_type}" property "${prop_name}" default must be an integer.`
					);
				}
				if (prop_def.min !== undefined && !Number.isInteger(prop_def.min)) {
					throw new Error(
						`Node type "${node_type}" property "${prop_name}" min must be an integer.`
					);
				}
				if (prop_def.max !== undefined && !Number.isInteger(prop_def.max)) {
					throw new Error(
						`Node type "${node_type}" property "${prop_name}" max must be an integer.`
					);
				}
				if (
					prop_def.min !== undefined &&
					prop_def.max !== undefined &&
					prop_def.min > prop_def.max
				) {
					throw new Error(
						`Node type "${node_type}" property "${prop_name}" min must not be greater than max.`
					);
				}
				if (
					prop_def.default !== undefined &&
					((prop_def.min !== undefined && prop_def.default < prop_def.min) ||
						(prop_def.max !== undefined && prop_def.default > prop_def.max))
				) {
					throw new Error(
						`Node type "${node_type}" property "${prop_name}" default must be within its min/max range.`
					);
				}
			}
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
				] as const) {
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
 * @throws {Error} Throws if a kind 'annotation' type has a registered component
 */
export function validate_config_components(schema: DocumentSchema, config: SessionConfig): void {
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
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate_primitive_value(type: PrimitiveType, value: any): boolean {
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
 * @throws {Error} Throws if ranges are invalid
 */
function validate_range_array(
	node_id: string,
	prop_name: string,
	label: 'mark' | 'annotation',
	ranges: Array<Attachment>,
	container_length: number,
	allowed_types: Array<string> | null | undefined,
	all_nodes: Record<string, DocumentNode>,
	require_references: boolean
): void {
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
 * @throws {Error} Throws if marks or annotations are invalid
 */
function validate_marks_and_annotations(
	node_id: string,
	prop_name: string,
	value: { marks: Array<Mark>; annotations: Array<Annotation> },
	prop_def: { mark_types?: string[]; annotation_types?: string[] },
	container_length: number,
	all_nodes: Record<string, DocumentNode>,
	require_references: boolean
): void {
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
 * @throws {Error} Throws if marks or annotations are invalid
 */
function validate_text_property(
	node_id: string,
	prop_name: string,
	value: Text,
	prop_def: TextProperty,
	all_nodes: Record<string, DocumentNode>,
	require_references: boolean
): void {
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

export function is_id_valid(id: string): boolean {
	return typeof id === 'string' && id.length > 0 && is_path_string_segment_valid(id);
}

/**
 * Validate a node against its schema.
 *
 * @param node - The node to validate
 * @param schema - The document schema
 * @param all_nodes - All nodes in the document to check references
 * @param options - Validation options
 * @throws {Error} Throws if the node is invalid
 */
export function validate_node(
	node: DocumentNode,
	schema: DocumentSchema,
	all_nodes: Record<string, DocumentNode> = {},
	options: { require_references?: boolean } = {}
): void {
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
			if (prop_def.type === 'string' && prop_def.values && !prop_def.values.includes(value)) {
				throw new Error(
					`Node ${node.id} has an invalid property: ${prop_name} must be one of [${prop_def.values.join(', ')}].`
				);
			}
			if (
				prop_def.type === 'integer' &&
				((prop_def.min !== undefined && value < prop_def.min) ||
					(prop_def.max !== undefined && value > prop_def.max))
			) {
				throw new Error(
					`Node ${node.id} has an invalid property: ${prop_name} must be between ${prop_def.min ?? '-Infinity'} and ${prop_def.max ?? 'Infinity'}.`
				);
			}
		}
		if (prop_def.type === 'text') {
			validate_text_property(
				node.id,
				prop_name,
				value,
				prop_def as TextProperty,
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
					`Node ${node.id} property ${prop_name} references node ${value} of type ${referenced_node.type}, but only types [${(prop_def as NodeProperty).node_types.join(', ')}] are allowed.`
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

			if (!node_array_nodes.every((id: unknown) => typeof id === 'string' && is_id_valid(id))) {
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
 * @throws {Error} Throws if the document is invalid
 */
export function validate_document(doc: Document, schema: DocumentSchema): void {
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
 * @param schema - The document schema
 * @param doc - The document containing nodes
 * @param path - Array path to the value, or a string node ID
 * @returns The value at the specified path
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function get(schema: DocumentSchema, doc: Document, path: DocumentPath | string): any {
	if (typeof path === 'string') {
		path = [path];
	}
	if (!(Array.isArray(path) && path.length >= 1)) {
		throw new Error(`Invalid path provided ${JSON.stringify(path)}`);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let val: any = doc.nodes[path[0]];
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
				val = val.nodes;
				val_type = 'node_id_array';
			} else if (path_segment === 'marks') {
				val = val.marks;
				val_type = 'range_array';
			} else if (path_segment === 'annotations') {
				val = val.annotations;
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
 */
export function property_type(schema: DocumentSchema, type: string, property: string): string {
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
 * Determines the kind of a node ('document', 'block', 'text', 'mark', or 'annotation').
 */
export function kind(schema: DocumentSchema, node: DocumentNode): NodeKind {
	return schema[node.type].kind;
}

/**
 * Inspects a path to get metadata about the value at that location.
 */
export function inspect(schema: DocumentSchema, doc: Document, path: DocumentPath): Inspection {
	const parent = path.length > 1 ? get(schema, doc, path.slice(0, -1)) : undefined;
	if (parent?.type) {
		const property_name = path.at(-1) as string;
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
 * Splices an annotated text value: deletes [start, start + delete_count),
 * inserts text at start, and adjusts mark/annotation ranges accordingly.
 *
 * This is the single source of truth for how a text splice affects ranges;
 * both forward ops and their inverses go through it (see the 'splice' case
 * in apply_op_to_draft). Offsets are in characters (grapheme clusters, as
 * segmented by Intl.Segmenter — the same unit as all svedit text offsets,
 * see get_char_length in utils.js).
 *
 * When prior_ranges is given (lossy inverse ops carry the exact ranges to
 * restore), range adjustment is skipped and the given ranges are used
 * verbatim.
 *
 * The input value is never mutated.
 *
 * @param value - The current {content, marks, annotations} value
 * @param start - Character offset to splice at
 * @param delete_count - Number of characters to delete
 * @param text - Text to insert at start ('' for pure deletion)
 * @param prior_ranges - Exact ranges to restore instead of adjusting
 * @returns The next value, plus the ids of mark/annotation nodes whose range collapsed away
 */
export function splice_annotated_text(
	value: Text,
	start: number,
	delete_count: number,
	text: string,
	prior_ranges?: { marks: Array<Mark>; annotations: Array<Annotation> }
): { value: Text; removed_node_ids: NodeId[] } {
	const content =
		char_slice(value.content, 0, start) + text + char_slice(value.content, start + delete_count);

	if (prior_ranges) {
		return {
			value: {
				content,
				marks: structuredClone(prior_ranges.marks),
				annotations: structuredClone(prior_ranges.annotations)
			},
			removed_node_ids: []
		};
	}

	let marks = value.marks;
	let annotations = value.annotations;
	const removed_node_ids: NodeId[] = [];

	if (delete_count > 0) {
		const marks_result = adjust_ranges_for_deletion(marks, start, start + delete_count);
		const annotations_result = adjust_ranges_for_deletion(annotations, start, start + delete_count);
		marks = marks_result.ranges;
		annotations = annotations_result.ranges;
		removed_node_ids.push(...marks_result.removed_node_ids, ...annotations_result.removed_node_ids);
	}

	const insert_length = get_char_length(text);
	if (insert_length > 0) {
		marks = adjust_ranges_for_insertion(marks, start, insert_length);
		annotations = adjust_ranges_for_insertion(annotations, start, insert_length);
	}

	return { value: { content, marks, annotations }, removed_node_ids };
}

/**
 * Creates a mutable draft of a document: a new document object with a new
 * nodes map, sharing the (immutable) node objects with the original.
 *
 * apply_op_to_draft mutates the draft's nodes map but copies node objects
 * before changing them, so node identity is preserved for unchanged nodes
 * (fine-grained rendering relies on this) and the original document is
 * never touched.
 *
 * @returns A draft document safe to mutate via apply_op_to_draft
 */
export function create_document_draft(doc: Document): Document {
	return {
		...doc,
		nodes: { ...doc.nodes }
	};
}

/**
 * Applies an operation to a document draft in place.
 *
 * The draft's nodes map is mutated, but node objects are copied on write —
 * one nodes-map copy per draft (see create_document_draft) replaces the
 * previous one-copy-per-op behavior, which made transactions with many ops
 * (paste, cascade delete) O(N·ops).
 *
 * @param draft - A draft created via create_document_draft
 * @param op - The operation to apply [type, ...args]
 * @returns The same draft, for convenience
 */
export function apply_op_to_draft(draft: Document, op: DocumentOperation): Document {
	const [type, ...args] = op;
	if (type === 'set') {
		const [node_id, property] = args[0];
		draft.nodes[node_id] = {
			...draft.nodes[node_id],
			[property]: structuredClone(args[1])
		};
	} else if (type === 'splice') {
		// args: [[node_id, property], start, delete_count, text, prior_ranges?]
		const [node_id, property] = args[0];
		const node = draft.nodes[node_id];
		// Guard with a clear error: op streams may come from outside a
		// Transaction (replay, ingest), where nothing has validated the
		// target yet.
		if (typeof node?.[property]?.content !== 'string') {
			throw new Error(
				`Cannot splice ${JSON.stringify([node_id, property])}: not an annotated text value`
			);
		}
		const { value } = splice_annotated_text(node[property], args[1], args[2], args[3], args[4]);
		draft.nodes[node_id] = {
			...node,
			[property]: value
		};
	} else if (type === 'create') {
		draft.nodes[args[0].id] = structuredClone(args[0]);
	} else if (type === 'delete') {
		delete draft.nodes[args[0]];
	}
	return draft;
}

/**
 * Applies an operation to a document and returns the new document.
 * Uses copy-on-write semantics.
 *
 * @param doc - The document to apply the operation to
 * @param op - The operation to apply [type, ...args]
 * @returns The new document with the operation applied
 */
export function apply_op(doc: Document, op: DocumentOperation): Document {
	return apply_op_to_draft(create_document_draft(doc), op);
}

/**
 * Applies a sequence of ops to a document and returns the new document.
 *
 * This is the replay primitive for host-side history features:
 * materialize a document at any version from a snapshot plus the ops
 * recorded after it (e.g. entries spilled from Session history, or a
 * persisted op log).
 *
 * @param doc - The document to start from (not mutated)
 * @param ops - Ops to apply, in order
 * @returns The new document with all ops applied
 */
export function apply_ops(doc: Document, ops: DocumentOperation[]): Document {
	const draft = create_document_draft(doc);
	for (const op of ops) {
		apply_op_to_draft(draft, op);
	}
	return draft;
}

/**
 * Returns the id of the node an op addresses.
 *
 * Ops are node-scoped by construction: set/splice target
 * [node_id, property], create carries the node, delete carries the id.
 * This is what makes node-scoped history filtering possible (see
 * Session.history_for).
 *
 * @returns The addressed node id, or null for unknown ops
 */
export function op_target_node_id(op: DocumentOperation): NodeId | null {
	const [type] = op;
	if (type === 'set' || type === 'splice') return op[1][0];
	if (type === 'create') return op[1].id;
	if (type === 'delete') return op[1];
	return null;
}

/**
 * Counts how many times a node is referenced in the document.
 */
export function count_references(schema: DocumentSchema, doc: Document, node_id: NodeId): number {
	let count = 0;

	for (const node of Object.values(doc.nodes)) {
		for (const [property, value] of Object.entries(node)) {
			if (property === 'id' || property === 'type') continue;

			const prop_type = property_type(schema, node.type, property);

			if (prop_type === 'node_array') {
				count += value.nodes.filter((id: NodeId) => id === node_id).length;
			} else if (prop_type === 'node' && value === node_id) {
				count += 1;
			}

			if ((prop_type === 'text' || prop_type === 'node_array') && value) {
				count += [...value.marks, ...value.annotations].filter(
					(range) => range.node_id === node_id
				).length;
			}
		}
	}

	return count;
}

/**
 * Whether a mark can be switched between these types.
 */
export function can_switch_mark_type(
	schema: DocumentSchema,
	from_type: string,
	to_type: string
): boolean {
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
 * An attachment (mark or annotation) enriched with its index in the parent
 * attachment array and the resolved payload node.
 */
export type SelectedAttachment = Attachment & { index: number; node: DocumentNode };

/**
 * Gets ranges of the given key ('marks' or 'annotations') touched by the
 * current selection.
 *
 * Non-collapsed selections use strict half-open range intersection, so merely
 * adjacent boundaries do not count as touching. Collapsed text carets are only
 * inside a range when they are strictly between start and end; a caret at
 * either boundary is not active.
 */
function get_selected_ranges(
	schema: DocumentSchema,
	doc: Document,
	selection: Selection | null | undefined,
	key: 'marks' | 'annotations'
): SelectedAttachment[] {
	if (selection?.type !== 'text' && selection?.type !== 'node') return [];
	const range = get_selection_range(selection);
	if (!range) return [];

	const annotated_prop = get(schema, doc, selection.path);
	const ranges = annotated_prop?.[key] ?? [];
	const is_collapsed = range.start_offset === range.end_offset;

	return ranges
		.map((attachment: Attachment, index: number) => {
			const node = doc.nodes[attachment.node_id];
			return {
				...attachment,
				index,
				node
			};
		})
		.filter(({ start_offset, end_offset }: SelectedAttachment) => {
			if (is_collapsed) {
				return start_offset < range.start_offset && end_offset > range.start_offset;
			}
			return start_offset < range.end_offset && end_offset > range.start_offset;
		});
}

/**
 * Gets marks touched by the current selection.
 */
export function get_selected_marks(
	schema: DocumentSchema,
	doc: Document,
	selection?: Selection | null
): SelectedAttachment[] {
	return get_selected_ranges(schema, doc, selection, 'marks');
}

/**
 * Gets annotations touched by the current selection.
 */
export function get_selected_annotations(
	schema: DocumentSchema,
	doc: Document,
	selection?: Selection | null
): SelectedAttachment[] {
	return get_selected_ranges(schema, doc, selection, 'annotations');
}

/**
 * Node types represented in the selected ranges.
 */
export function get_selected_range_types(selected_ranges: SelectedAttachment[]): Set<string> {
	return new Set(
		selected_ranges.map(({ node }) => node?.type).filter((type): type is string => Boolean(type))
	);
}

/**
 * Counts references to a node, excluding nodes marked for deletion.
 */
export function count_references_excluding_deleted(
	schema: DocumentSchema,
	doc: Document,
	target_node_id: NodeId,
	nodes_to_delete: Record<NodeId, boolean>
): number {
	let count = 0;

	for (const node of Object.values(doc.nodes)) {
		if (nodes_to_delete[node.id]) continue;

		for (const [property, value] of Object.entries(node)) {
			if (property === 'id' || property === 'type') continue;

			const prop_type = property_type(schema, node.type, property);

			if (prop_type === 'node_array') {
				count += value.nodes.filter((id: NodeId) => id === target_node_id).length;
			} else if (prop_type === 'node' && value === target_node_id) {
				count += 1;
			}

			if ((prop_type === 'text' || prop_type === 'node_array') && value) {
				count += [...value.marks, ...value.annotations].filter(
					(range) => range.node_id === target_node_id
				).length;
			}
		}
	}

	return count;
}

/**
 * Iterates all node references going out of a node, invoking the visitor
 * once per occurrence (multiplicity matters for reference counting).
 * Covers the same reference kinds as count_references_excluding_deleted:
 * a `node` property, `node_array` .nodes ids, and the mark/annotation
 * node_ids carried on `text` and `node_array` properties.
 */
export function visit_node_references(
	schema: DocumentSchema,
	node: DocumentNode,
	visit: (referenced_id: NodeId) => void
): void {
	const node_schema = schema[node.type];
	if (!node_schema) return;

	for (const [property, prop_def] of Object.entries(node_schema.properties)) {
		const value = node[property];
		if (value === undefined || value === null) continue;

		const prop_type = prop_def.type;

		if (prop_type === 'node_array') {
			for (const id of value.nodes) visit(id);
		} else if (prop_type === 'node' && typeof value === 'string') {
			visit(value);
		}

		if ((prop_type === 'text' || prop_type === 'node_array') && value) {
			for (const range of value.marks) visit(range.node_id);
			for (const range of value.annotations) visit(range.node_id);
		}
	}
}

/**
 * Builds reference counts for every referenced node in one full-document
 * scan. Used by cascade deletion so the fixpoint can decrement counts
 * incrementally instead of re-scanning the document per candidate node.
 */
export function build_reference_counts(schema: DocumentSchema, doc: Document): Map<NodeId, number> {
	const counts: Map<NodeId, number> = new Map();
	for (const node of Object.values(doc.nodes)) {
		visit_node_references(schema, node, (id) => {
			counts.set(id, (counts.get(id) || 0) + 1);
		});
	}
	return counts;
}

/**
 * Gets ids of nodes that reference any of the target nodes.
 */
export function get_referencing_node_ids(
	schema: DocumentSchema,
	doc: Document,
	target_node_ids: Iterable<NodeId>
): NodeId[] {
	const target_ids = new Set(target_node_ids);
	const referencing_node_ids: Set<NodeId> = new Set();
	if (target_ids.size === 0) return [];

	for (const node of Object.values(doc.nodes)) {
		for (const [property, value] of Object.entries(node)) {
			if (property === 'id' || property === 'type') continue;

			const prop_type = property_type(schema, node.type, property);

			if (prop_type === 'node_array') {
				if (value.nodes.some((id: NodeId) => target_ids.has(id))) {
					referencing_node_ids.add(node.id);
				}
			} else if (prop_type === 'node' && target_ids.has(value)) {
				referencing_node_ids.add(node.id);
			}

			if (
				(prop_type === 'text' || prop_type === 'node_array') &&
				value &&
				[...value.marks, ...value.annotations].some((range) => target_ids.has(range.node_id))
			) {
				referencing_node_ids.add(node.id);
			}
		}
	}

	return [...referencing_node_ids];
}

/**
 * Validates a selection against the current document state.
 * Works with any object that implements get() and inspect() (Session or Transaction).
 *
 * @throws {Error} Throws if the selection is invalid
 */
export function validate_selection(
	selection: Selection | null | undefined,
	session_or_transaction: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		get: (path: DocumentPath) => any;
		inspect: (path: DocumentPath) => Inspection;
	}
): void {
	if (!selection) return;

	const selection_type = selection.type;
	if (!['node', 'text', 'property'].includes(selection_type)) {
		throw new Error(`Invalid selection type: ${selection_type}`);
	}

	if (selection_type === 'node') {
		const node_array_prop = session_or_transaction.get(selection.path);

		if (!node_array_prop || !Array.isArray(node_array_prop.nodes)) {
			throw new Error('Node selection path must point to a node_array');
		}

		const max_offset = node_array_prop.nodes.length;
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
