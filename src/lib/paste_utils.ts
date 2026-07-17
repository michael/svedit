import type {
	AnnotatedText,
	DocumentNode,
	DocumentSchema
} from './types.js';

function is_record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function is_annotated_text(value: unknown): value is AnnotatedText {
	return (
		is_record(value) &&
		typeof value.content === 'string' &&
		Array.isArray(value.marks) &&
		Array.isArray(value.annotations)
	);
}

export function normalize_line_endings(text: string): string {
	return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function dedent_plain_text(plain_text: string): string {
	const lines = normalize_line_endings(plain_text).split('\n');
	if (lines.length < 2) return plain_text;

	const non_empty_lines = lines.filter((line) => line.trim().length > 0);
	if (non_empty_lines.length === 0) return plain_text;

	const indented_non_empty_lines = non_empty_lines.filter((line) => /^[\t ]+/.test(line));
	const indented_line_ratio = indented_non_empty_lines.length / non_empty_lines.length;
	if (indented_line_ratio < 0.8) return plain_text;

	const leading_whitespace_lengths = indented_non_empty_lines
		.map((line) => line.match(/^[\t ]+/)?.[0].length || 0)
		.filter(Boolean);
	if (leading_whitespace_lengths.length === 0) return plain_text;

	const dedent_size = Math.min(...leading_whitespace_lengths);
	if (dedent_size <= 0) return plain_text;

	return lines
		.map((line) => {
			if (line.trim().length === 0) return line;
			let removable_count = 0;
			while (removable_count < dedent_size && removable_count < line.length) {
				const char = line[removable_count];
				if (char === ' ' || char === '\t') {
					removable_count += 1;
				} else {
					break;
				}
			}
			return line.slice(removable_count);
		})
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

export function get_text_property_name(
	node_type: string | null | undefined,
	schema: DocumentSchema
): string | null {
	if (!node_type) return null;
	const node_schema = schema[node_type];
	if (!node_schema || node_schema.kind !== 'text') return null;
	if (node_schema.properties?.content?.type === 'text') return 'content';
	return (
		Object.entries(node_schema.properties).find(([, property_definition]) => {
			return property_definition.type === 'text';
		})?.[0] || null
	);
}

export function get_text_content(node: unknown, schema: DocumentSchema): AnnotatedText | null {
	if (!is_record(node)) return null;

	const node_type = typeof node.type === 'string' ? node.type : null;
	const text_property_name = get_text_property_name(node_type, schema);
	if (text_property_name && is_annotated_text(node[text_property_name])) {
		return node[text_property_name];
	}

	if (is_annotated_text(node.content)) {
		return node.content;
	}

	return null;
}

export function is_text_like_node_payload(node: unknown, schema: DocumentSchema): boolean {
	if (!is_record(node)) return false;
	if (typeof node.type === 'string' && schema[node.type]?.kind === 'text') return true;
	return !!get_text_content(node, schema);
}

export function get_default_text_node(
	node_array_property_definition: unknown,
	schema: DocumentSchema
): string | null {
	if (
		!is_record(node_array_property_definition) ||
		node_array_property_definition.type !== 'node_array' ||
		!Array.isArray(node_array_property_definition.node_types)
	) {
		return null;
	}

	const default_node_type = node_array_property_definition.default_node_type;
	if (typeof default_node_type === 'string' && schema[default_node_type]?.kind === 'text') {
		return default_node_type;
	}

	return (
		node_array_property_definition.node_types.find(
			(node_type: unknown) => typeof node_type === 'string' && schema[node_type]?.kind === 'text'
		) || null
	) as string | null;
}

export function create_plain_text_nodes_payload(
	paragraph_fragments: string[],
	node_type: string | null | undefined,
	schema: DocumentSchema
): { main_nodes: string[]; nodes: Record<string, DocumentNode> } | null {
	if (!Array.isArray(paragraph_fragments) || paragraph_fragments.length === 0 || !node_type) {
		return null;
	}

	const text_property_name = get_text_property_name(node_type, schema);
	if (!text_property_name) return null;

	const payload: { main_nodes: string[]; nodes: Record<string, DocumentNode> } = {
		main_nodes: [],
		nodes: {}
	};

	for (let i = 0; i < paragraph_fragments.length; i++) {
		const fragment = paragraph_fragments[i];
		const node_id = 'fragment_' + i;
		payload.nodes[node_id] = {
			id: node_id,
			type: node_type,
			[text_property_name]: {
				content: fragment,
				marks: [],
				annotations: []
			}
		};
		payload.main_nodes.push(node_id);
	}

	return payload;
}
