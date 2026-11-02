import type { Text, DocumentNode, DocumentSchema } from './types.js';

const is_record = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const is_text = (value: unknown): value is Text =>
	is_record(value) &&
	typeof value.content === 'string' &&
	Array.isArray(value.marks) &&
	Array.isArray(value.annotations);

const leading_whitespace = (line: string) => line.match(/^[\t ]*/)![0].length;

export function normalize_line_endings(text: string): string {
	return text.replace(/\r\n?/g, '\n');
}

/** Remove common indentation when at least 80% of the non-empty lines are indented. */
export function dedent_plain_text(plain_text: string): string {
	const lines = normalize_line_endings(plain_text).split('\n');
	const non_empty_lines = lines.filter((line) => line.trim().length > 0);
	if (lines.length < 2 || non_empty_lines.length === 0) return plain_text;
	const indents = non_empty_lines.map(leading_whitespace).filter(Boolean);
	if (indents.length / non_empty_lines.length < 0.8) return plain_text;
	const dedent_size = Math.min(...indents);
	return lines
		.map((line) =>
			line.trim() ? line.slice(Math.min(dedent_size, leading_whitespace(line))) : line
		)
		.join('\n');
}

export function split_plain_text_paragraphs(plain_text: string): string[] {
	return normalize_line_endings(plain_text)
		.split(/\n{2,}/)
		.map((fragment) => fragment.trim())
		.filter(Boolean);
}

export function normalize_plain_text_for_single_line_property(plain_text: string): string {
	return normalize_line_endings(plain_text).replace(/\s*\n+\s*/g, ' ');
}

/** The text property of a text node type ('content' by convention). */
export function get_text_property_name(
	node_type: string | null | undefined,
	schema: DocumentSchema
): string | null {
	const node_schema = node_type ? schema[node_type] : null;
	if (node_schema?.kind !== 'text') return null;
	if (node_schema.properties?.content?.type === 'text') return 'content';
	return (
		Object.keys(node_schema.properties).find(
			(name) => node_schema.properties[name].type === 'text'
		) || null
	);
}

/** The text value of a (possibly foreign) node payload. */
export function get_text_content(node: unknown, schema: DocumentSchema): Text | null {
	if (!is_record(node)) return null;
	const name = get_text_property_name(typeof node.type === 'string' ? node.type : null, schema);
	if (name && is_text(node[name])) return node[name];
	return is_text(node.content) ? node.content : null;
}

export function is_text_like_node_payload(node: unknown, schema: DocumentSchema): boolean {
	if (!is_record(node)) return false;
	if (typeof node.type === 'string' && schema[node.type]?.kind === 'text') return true;
	return !!get_text_content(node, schema);
}

/** The default node type of a node array, if it is a text node type, else its first text node type. */
export function get_default_text_node(
	node_array_property_definition: unknown,
	schema: DocumentSchema
): string | null {
	const definition = node_array_property_definition;
	if (
		!is_record(definition) ||
		definition.type !== 'node_array' ||
		!Array.isArray(definition.node_types)
	) {
		return null;
	}
	const is_text_type = (type: unknown): type is string =>
		typeof type === 'string' && schema[type]?.kind === 'text';
	if (is_text_type(definition.default_node_type)) return definition.default_node_type;
	return definition.node_types.find(is_text_type) || null;
}

/** A node payload with one text node per paragraph. */
export function create_plain_text_nodes_payload(
	paragraph_fragments: string[],
	node_type: string | null | undefined,
	schema: DocumentSchema
): { main_nodes: string[]; nodes: Record<string, DocumentNode> } | null {
	if (!Array.isArray(paragraph_fragments) || paragraph_fragments.length === 0 || !node_type)
		return null;
	const text_property_name = get_text_property_name(node_type, schema);
	if (!text_property_name) return null;
	const payload: { main_nodes: string[]; nodes: Record<string, DocumentNode> } = {
		main_nodes: [],
		nodes: {}
	};
	paragraph_fragments.forEach((content, index) => {
		const id = `fragment_${index}`;
		payload.nodes[id] = {
			id,
			type: node_type,
			[text_property_name]: { content, marks: [], annotations: [] }
		};
		payload.main_nodes.push(id);
	});
	return payload;
}
