/**
 * Document utilities shared by Session and Transaction. They operate on
 * plain schema and document data, without history or reactivity.
 */

import {
	assert_path_string_segment,
	is_path_string_segment_valid,
	get_selection_range,
	get_char_length,
	serialize_path,
	are_ranges_exclusive,
	for_each_reference
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
	Document,
	DocumentNode,
	ValidateDocumentSchema,
	Inspection,
	DocumentOperation,
	SessionConfig
} from './types.js';

/** Resolves a node id to a node (or undefined when it does not exist). */
export type NodeLookup = (node_id: NodeId) => DocumentNode | undefined;

/**
 * Identity function that keeps the schema at runtime and lets the IDE
 * infer literal schema types.
 */
export function define_document_schema<S extends Record<string, NodeSchema>>(
	schema: S & ValidateDocumentSchema<S>
): S {
	return schema;
}

const PRIMITIVE_TYPES = new Set([
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
]);

/** Check if a string represents a valid primitive type. */
export function is_primitive_type(type: string): type is PrimitiveType {
	return PRIMITIVE_TYPES.has(type);
}

/**
 * The default node type of a property that references nodes: the explicit
 * default_node_type, or the only allowed node type. Null if ambiguous.
 */
export function get_default_node_type(
	property_definition: NodeProperty | NodeArrayProperty
): string | null {
	if (!property_definition?.node_types) return null;
	const { default_node_type, node_types } = property_definition;
	return default_node_type || (node_types.length === 1 ? node_types[0] : null);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function get_property_default(property_definition: PropertyDefinition): any {
	if ('default' in property_definition) return structuredClone(property_definition.default);
	switch (property_definition.type) {
		case 'string':
			return '';
		case 'integer':
		case 'number':
			return 0;
		case 'boolean':
			return false;
		case 'text':
			return { content: '', marks: [], annotations: [] };
		case 'node_array':
			return { nodes: [], marks: [], annotations: [] };
		case 'string_array':
		case 'number_array':
		case 'boolean_array':
		case 'integer_array':
			return [];
	}
}

/**
 * Fill omitted properties with schema defaults and Svedit's built-in type
 * defaults. A convenience for schema evolution, not a migration system:
 * renames or data transformations still need explicit migrations.
 *
 * @returns A shallow copy of the node with cloned default values filled in
 */
export function fill_node_defaults(node: DocumentNode, schema: DocumentSchema): DocumentNode {
	const filled = { ...node };
	const properties = schema[node.type]?.properties ?? {};
	for (const [name, definition] of Object.entries(properties)) {
		if (filled[name] !== undefined) continue;
		const value = get_property_default(definition);
		if (value !== undefined) filled[name] = value;
	}
	return filled;
}

/**
 * Fill omitted properties with defaults across a document. This does not
 * infer values or rename fields; use it as one step of an explicit migration.
 *
 * @returns A document copy with cloned default values filled in
 */
export function fill_document_defaults(doc: Document, schema: DocumentSchema): Document {
	const nodes: Record<string, DocumentNode> = {};
	for (const [id, node] of Object.entries(doc.nodes)) nodes[id] = fill_node_defaults(node, schema);
	return { ...doc, nodes };
}

/**
 * Validate a document schema: property names, enumerated string values,
 * integer bounds, referenced node types, and mark/annotation type kinds.
 *
 * @throws {Error} Throws if the document schema is invalid
 */
export function validate_document_schema(document_schema: DocumentSchema): void {
	for (const [node_type, node_schema] of Object.entries(document_schema)) {
		for (const [prop_name, prop_def] of Object.entries(node_schema.properties)) {
			assert_path_string_segment(prop_name, `Property name "${prop_name}"`);
			const fail = (message: string) => {
				throw new Error(`Node type "${node_type}" property "${prop_name}" ${message}`);
			};

			if (prop_def.type === 'string' && prop_def.values !== undefined) {
				const { values } = prop_def;
				if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
					fail('values must be an array of strings.');
				}
				if (values.length === 0) fail('values must not be empty.');
				if (new Set(values).size !== values.length) fail('values must be unique.');
				if (prop_def.default !== undefined && !values.includes(prop_def.default)) {
					fail('default must be one of its allowed values.');
				}
			}

			if (prop_def.type === 'integer') {
				const { default: value, min, max } = prop_def;
				if (value !== undefined && !Number.isInteger(value)) fail('default must be an integer.');
				if (min !== undefined && !Number.isInteger(min)) fail('min must be an integer.');
				if (max !== undefined && !Number.isInteger(max)) fail('max must be an integer.');
				if (min !== undefined && max !== undefined && min > max) {
					fail('min must not be greater than max.');
				}
				if (
					value !== undefined &&
					((min !== undefined && value < min) || (max !== undefined && value > max))
				) {
					fail('default must be within its min/max range.');
				}
			}

			if (prop_def.type === 'node' || prop_def.type === 'node_array') {
				const missing = prop_def.node_types.filter((type) => !(type in document_schema));
				if (missing.length > 0) {
					fail(
						`references unknown node types: ${missing.join(', ')}. Available node types: ${Object.keys(document_schema).join(', ')}`
					);
				}
			}

			if (prop_def.type === 'text' || prop_def.type === 'node_array') {
				for (const [key, expected_kind] of [
					['mark_types', 'mark'],
					['annotation_types', 'annotation']
				] as const) {
					const invalid = (prop_def[key] ?? []).filter(
						(type) => document_schema[type]?.kind !== expected_kind
					);
					if (invalid.length > 0) {
						fail(
							`${key} must reference node types of kind '${expected_kind}', got: ${invalid.join(', ')}.`
						);
					}
				}
			}
		}
	}
}

/**
 * Annotations are data-only overlay ranges interpreted by the app; only
 * marks render in place through components.
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

const is_text_value = (value: unknown) =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as { content: unknown }).content === 'string' &&
	Array.isArray((value as { marks: unknown }).marks) &&
	Array.isArray((value as { annotations: unknown }).annotations);

const is_number = (value: unknown) => typeof value === 'number' && !isNaN(value);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRIMITIVE_VALIDATORS: Record<PrimitiveType, (value: any) => boolean> = {
	string: (value) => typeof value === 'string',
	number: is_number,
	boolean: (value) => typeof value === 'boolean',
	integer: Number.isInteger,
	datetime: (value) => typeof value === 'string' && !isNaN(Date.parse(value)),
	text: is_text_value,
	string_array: (value) => Array.isArray(value) && value.every((v) => typeof v === 'string'),
	number_array: (value) => Array.isArray(value) && value.every(is_number),
	boolean_array: (value) => Array.isArray(value) && value.every((v) => typeof v === 'boolean'),
	integer_array: (value) => Array.isArray(value) && value.every(Number.isInteger)
};

export function is_id_valid(id: string): boolean {
	return typeof id === 'string' && id.length > 0 && is_path_string_segment_valid(id);
}

/** Generate a node id with config.generate_id (or a random UUID-based id). */
export function generate_id(config: SessionConfig): string {
	const id = config?.generate_id ? config.generate_id() : `node_${crypto.randomUUID()}`;
	if (!is_id_valid(id)) {
		throw new Error(
			`Generated node id ${JSON.stringify(id)} is invalid. Node ids must be non-empty strings that start with a letter or underscore, contain only letters, numbers, underscores, or dashes, and must not contain "__".`
		);
	}
	return id;
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
	{ require_references = true }: { require_references?: boolean } = {}
): void {
	const id = node.id;
	if (!is_id_valid(id)) throw new Error(`Node ${id} has an invalid id.`);
	if (!node.type || !schema[node.type])
		throw new Error(`Node ${id} has an invalid type: ${node.type}`);

	// Checks one reference; returns false for a tolerated missing node.
	const check_reference = (prefix: string, ref_id: NodeId, allowed: string[] | undefined) => {
		const referenced = all_nodes[ref_id];
		if (!referenced) {
			if (require_references) throw new Error(`${prefix} references missing node ${ref_id}.`);
			return;
		}
		if (allowed && !allowed.includes(referenced.type)) {
			throw new Error(
				`${prefix} references node ${ref_id} of type ${referenced.type}, but only types [${allowed.join(', ')}] are allowed.`
			);
		}
	};

	const check_ranges = (
		prop_name: string,
		label: 'mark' | 'annotation',
		ranges: Attachment[],
		length: number,
		allowed: string[] | undefined
	) => {
		for (const [index, range] of ranges.entries()) {
			if (
				typeof range !== 'object' ||
				range === null ||
				!Number.isInteger(range.start_offset) ||
				!Number.isInteger(range.end_offset) ||
				!is_id_valid(range.node_id)
			) {
				throw new Error(
					`Node ${id} property ${prop_name} has an invalid ${label} at index ${index}. Ranges must have integer start_offset/end_offset and a valid node_id.`
				);
			}
			const prefix = `Node ${id} property ${prop_name} ${label} ${range.node_id}`;
			const span = `${range.start_offset}-${range.end_offset}`;
			if (range.start_offset < 0 || range.end_offset > length) {
				throw new Error(`${prefix} is out of bounds: ${span}, container length is ${length}.`);
			}
			if (range.start_offset >= range.end_offset) {
				throw new Error(`${prefix} must not be empty or reversed: ${span}.`);
			}
			check_reference(
				`Node ${id} property ${prop_name} ${label}`,
				range.node_id,
				allowed?.length ? allowed : undefined
			);
		}
	};

	const check_attachments = (
		prop_name: string,
		value: { marks: Attachment[]; annotations: Attachment[] },
		prop_def: { mark_types?: string[]; annotation_types?: string[] },
		length: number
	) => {
		check_ranges(prop_name, 'mark', value.marks, length, prop_def.mark_types);
		if (!are_ranges_exclusive(value.marks, length)) {
			throw new Error(
				`Node ${id} property ${prop_name} has overlapping marks. Marks must be mutually exclusive.`
			);
		}
		check_ranges(prop_name, 'annotation', value.annotations, length, prop_def.annotation_types);
	};

	for (const [prop_name, prop_def] of Object.entries(schema[node.type].properties)) {
		const value = node[prop_name];
		const invalid = (expectation: string) =>
			new Error(`Node ${id} has an invalid property: ${prop_name} must ${expectation}.`);

		if (prop_def.type === 'node') {
			if (!is_id_valid(value)) throw invalid('be a valid node id');
			check_reference(`Node ${id} property ${prop_name}`, value, prop_def.node_types);
		} else if (prop_def.type === 'node_array') {
			if (
				!value ||
				typeof value !== 'object' ||
				!Array.isArray(value.nodes) ||
				!Array.isArray(value.marks) ||
				!Array.isArray(value.annotations)
			) {
				throw invalid('be an object with nodes, marks and annotations');
			}
			if (!value.nodes.every(is_id_valid)) throw invalid('contain valid node ids');
			for (const ref_id of value.nodes) {
				check_reference(`Node ${id} property ${prop_name}`, ref_id, prop_def.node_types);
			}
			check_attachments(prop_name, value, prop_def, value.nodes.length);
		} else {
			const is_valid = PRIMITIVE_VALIDATORS[prop_def.type];
			if (is_valid && !is_valid(value)) throw invalid(`be of type ${prop_def.type}`);
			if (prop_def.type === 'string' && prop_def.values && !prop_def.values.includes(value)) {
				throw invalid(`be one of [${prop_def.values.join(', ')}]`);
			}
			if (
				prop_def.type === 'integer' &&
				((prop_def.min !== undefined && value < prop_def.min) ||
					(prop_def.max !== undefined && value > prop_def.max))
			) {
				throw invalid(
					`be between ${prop_def.min ?? '-Infinity'} and ${prop_def.max ?? 'Infinity'}`
				);
			}
			if (prop_def.type === 'text') {
				check_attachments(prop_name, value, prop_def, get_char_length(value.content));
			}
		}
	}
}

/**
 * Validate a document against its schema.
 *
 * @throws {Error} Throws if the document is invalid
 */
export function validate_document(doc: Document, schema: DocumentSchema): void {
	if (!is_id_valid(doc.document_id))
		throw new Error(`Document ${doc.document_id} has an invalid id.`);
	for (const [node_id, node] of Object.entries(doc.nodes)) {
		if (!is_id_valid(node_id))
			throw new Error(`Document node map contains an invalid id: ${node_id}.`);
		if (node.id !== node_id) {
			throw new Error(`Document node map key ${node_id} does not match node id ${node.id}.`);
		}
		validate_node(node, schema, doc.nodes);
	}
}

/**
 * Resolve a path (or a single node id) to a node or property value.
 * Nodes are looked up through `lookup`, which lets callers observe exactly
 * which nodes a path depends on.
 */
export function resolve(
	schema: DocumentSchema,
	path: DocumentPath | string,
	lookup: NodeLookup
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
	if (typeof path === 'string') return lookup(path);
	if (!Array.isArray(path) || path.length === 0) {
		throw new Error(`Invalid path provided ${JSON.stringify(path)}`);
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let value: any = lookup(path[0] as string);
	let kind = 'node';
	for (let index = 1; index < path.length; index++) {
		const segment = path[index];
		if (kind === 'node') {
			const type = property_type(schema, value.type, String(segment));
			if (type === 'node') {
				value = lookup(value[segment]);
			} else {
				value = value[segment];
				kind =
					type === 'node_array' || type === 'text'
						? type
						: type === 'string_array' || type === 'integer_array'
							? 'values'
							: 'value';
			}
		} else if (kind === 'node_array') {
			if (segment === 'nodes') {
				value = value.nodes;
				kind = 'node_ids';
			} else if (segment === 'marks' || segment === 'annotations') {
				value = value[segment];
				kind = 'ranges';
			} else if (typeof segment === 'number' || /^\d+$/.test(segment)) {
				value = lookup(value.nodes[segment]);
				kind = 'node';
			} else {
				throw new Error(
					`Invalid path segment "${segment}" for node_array. Use "nodes", "marks" or "annotations".`
				);
			}
		} else if (kind === 'node_ids') {
			value = lookup(value[segment]);
			kind = 'node';
		} else if (kind === 'values') {
			value = value[segment];
			kind = 'value';
		} else if (kind === 'text') {
			if (segment !== 'content' && segment !== 'marks' && segment !== 'annotations') {
				throw new Error(
					`Invalid path segment "${segment}" for text. Use "content", "marks" or "annotations".`
				);
			}
			value = value[segment];
			kind = segment === 'content' ? 'value' : 'ranges';
		} else if (kind === 'ranges') {
			value = value[segment];
			kind = 'range';
		} else if (kind === 'range') {
			if (segment === 'node_id') {
				value = lookup(value.node_id);
				kind = 'node';
			} else if (segment === 'start_offset' || segment === 'end_offset') {
				value = value[segment];
				kind = 'value';
			} else {
				throw new Error(
					`Invalid path segment "${segment}" for range. Use "start_offset", "end_offset", or "node_id".`
				);
			}
		}
	}
	return value;
}

/**
 * Gets a value from the document at the specified path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function get(schema: DocumentSchema, doc: Document, path: DocumentPath | string): any {
	return resolve(schema, path, (id) => doc.nodes[id]);
}

/** The type of a property: property_type('page', 'body') => 'node_array' */
export function property_type(schema: DocumentSchema, type: string, property: string): string {
	if (typeof type !== 'string') throw new Error(`Invalid type ${type} provided`);
	if (typeof property !== 'string') throw new Error(`Invalid property ${property} provided`);
	if (property === 'type' || property === 'id') return 'string';
	if (!schema[type]) throw new Error(`Type ${type} not found in schema`);
	const definition = schema[type].properties[property];
	if (!definition) throw new Error(`Property ${property} not found in type ${type}`);
	return definition.type;
}

/** The kind of a node ('document', 'block', 'text', 'mark', or 'annotation'). */
export function kind(schema: DocumentSchema, node: DocumentNode): NodeKind {
	return schema[node.type].kind;
}

/** Type information about the value at a path (see Session.inspect). */
export function inspect(
	schema: DocumentSchema,
	path: DocumentPath,
	lookup: NodeLookup
): Inspection {
	const parent = path.length > 1 ? resolve(schema, path.slice(0, -1), lookup) : undefined;
	if (parent?.type) {
		const name = path.at(-1) as string;
		return { kind: 'property', name, ...schema[parent.type].properties[name] };
	}
	const node = resolve(schema, path, lookup);
	return { kind: 'node', id: node.id, type: node.type, properties: schema[node.type] };
}

/**
 * Apply an operation to a document draft in place. Node objects are
 * replaced, never mutated, so unchanged nodes keep their identity. Values
 * pass through `copy`, so documents don't share objects with history ops.
 */
export function apply_op(
	draft: Document,
	op: DocumentOperation,
	copy: <T>(value: T) => T = (value) => value
): void {
	const [type, arg, value] = op;
	if (type === 'set') draft.nodes[arg[0]] = { ...draft.nodes[arg[0]], [arg[1]]: copy(value) };
	else if (type === 'create') draft.nodes[arg.id] = copy(arg);
	else if (type === 'delete') delete draft.nodes[arg];
}

/** The ids of the nodes an operation touches. */
export function op_node_id(op: DocumentOperation): NodeId {
	return op[0] === 'set' ? op[1][0] : op[0] === 'create' ? op[1].id : op[1];
}

/** Counts how many times a node is referenced in the document. */
export function count_references(schema: DocumentSchema, doc: Document, node_id: NodeId): number {
	let count = 0;
	for (const node of Object.values(doc.nodes)) {
		for_each_reference(schema, node, (id) => {
			if (id === node_id) count++;
		});
	}
	return count;
}

/** Reference counts for every referenced node, in one document scan. */
export function build_reference_counts(schema: DocumentSchema, doc: Document): Map<NodeId, number> {
	const counts = new Map<NodeId, number>();
	for (const node of Object.values(doc.nodes)) {
		for_each_reference(schema, node, (id) => counts.set(id, (counts.get(id) ?? 0) + 1));
	}
	return counts;
}

/** Ids of the nodes that reference any of the target nodes. */
export function get_referencing_node_ids(
	schema: DocumentSchema,
	doc: Document,
	target_node_ids: Iterable<NodeId>
): NodeId[] {
	const targets = new Set(target_node_ids);
	if (targets.size === 0) return [];
	const result: NodeId[] = [];
	for (const node of Object.values(doc.nodes)) {
		let references = false;
		for_each_reference(schema, node, (id) => {
			references ||= targets.has(id);
		});
		if (references) result.push(node.id);
	}
	return result;
}

/** Only property-less marks can switch their type. */
export function can_switch_mark_type(
	schema: DocumentSchema,
	from_type: string,
	to_type: string
): boolean {
	const is_plain_mark = (type: string) =>
		schema[type]?.kind === 'mark' && Object.keys(schema[type].properties ?? {}).length === 0;
	return is_plain_mark(from_type) && is_plain_mark(to_type);
}

/**
 * A mark or annotation enriched with its index in the attachment array and
 * the resolved payload node.
 */
export type SelectedAttachment = Attachment & { index: number; node: DocumentNode };

/**
 * Marks or annotations of `value` touched by a text or node selection.
 * Ranges must strictly intersect the selection: adjacent boundaries do not
 * count, and a collapsed caret must lie strictly inside a range.
 */
export function get_selected_attachments(
	value: { marks?: Attachment[]; annotations?: Attachment[] } | undefined,
	selection: Selection | null | undefined,
	key: 'marks' | 'annotations',
	lookup: NodeLookup
): SelectedAttachment[] {
	if (selection?.type !== 'text' && selection?.type !== 'node') return [];
	const { start_offset, end_offset } = get_selection_range(selection)!;
	const selected: SelectedAttachment[] = [];
	(value?.[key] ?? []).forEach((attachment, index) => {
		if (attachment.start_offset < end_offset && attachment.end_offset > start_offset) {
			selected.push({ ...attachment, index, node: lookup(attachment.node_id) });
		}
	});
	return selected;
}

/** Node types represented in the selected attachments. */
export function get_selected_range_types(selected: SelectedAttachment[]): Set<string> {
	return new Set(selected.map(({ node }) => node?.type).filter(Boolean));
}

/**
 * Validates a selection against a document (through a Session or Transaction).
 *
 * @throws {Error} Throws if the selection is invalid
 */
export function validate_selection(
	selection: Selection | null | undefined,
	target: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		get: (path: DocumentPath) => any;
		inspect: (path: DocumentPath) => Inspection;
	}
): void {
	if (!selection) return;
	const { type } = selection;
	if (type !== 'node' && type !== 'text' && type !== 'property') {
		throw new Error(`Invalid selection type: ${type}`);
	}
	if (type === 'property') {
		if (!target.inspect(selection.path)) {
			throw new Error(`Property selection path not found: ${serialize_path(selection.path)}`);
		}
		return;
	}
	const value = target.get(selection.path);
	let max_offset: number;
	if (type === 'node') {
		if (!value || !Array.isArray(value.nodes))
			throw new Error('Node selection path must point to a node_array');
		max_offset = value.nodes.length;
	} else {
		if (!value || typeof value.content !== 'string')
			throw new Error('Text selection path must point to text');
		max_offset = get_char_length(value.content);
	}
	const label = type === 'node' ? 'Node' : 'Text';
	for (const key of ['anchor_offset', 'focus_offset'] as const) {
		if (selection[key] < 0 || selection[key] > max_offset) {
			throw new Error(
				`${label} selection ${key} (${selection[key]}) is out of bounds. Max is ${max_offset}.`
			);
		}
	}
}
