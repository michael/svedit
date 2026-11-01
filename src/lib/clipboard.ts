/**
 * Copy and paste. Svedit embeds its native payload (nodes, marks and
 * annotations) in the copied HTML, next to fallback HTML and plain text for
 * other apps. Pasting prefers the native payload, then configured HTML
 * import, then plain text.
 */

import {
	normalize_line_endings,
	dedent_plain_text,
	split_plain_text_paragraphs,
	normalize_plain_text_for_single_line_property,
	get_text_property_name,
	get_text_content,
	is_text_like_node_payload,
	get_default_text_node,
	create_plain_text_nodes_payload
} from './paste_utils.js';
import { export_text_html } from './html_export.js';
import { escape_html } from './html_utils.js';
import { parse_html_paste, map_html_text, map_html_blocks } from './html_paste.js';
import type Session from './Session.svelte.js';
import type {
	DocumentNode,
	DocumentPath,
	DynamicRecord,
	NodeHtmlExporter,
	NodeSelection,
	PropertyDefinition,
	Selection
} from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySession = Session<any>;

const EMPTY_TEXT = () => ({ content: '', marks: [], annotations: [] });

/** HTML clipboard format with the Svedit payload embedded (URI-encoded, then base64). */
function encode_clipboard_html(payload: unknown, fallback_html: string): string {
	const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
	return `<meta charset="utf-8">
<div>
  <span data-svedit="${encoded}"></span>
</div>
${fallback_html}`;
}

function decode_clipboard_html(html: string): DynamicRecord | null {
	const encoded = html.match(/data-svedit="([^"]+)"/)?.[1];
	if (!encoded) return null;
	try {
		return JSON.parse(decodeURIComponent(atob(encoded)));
	} catch (error) {
		console.warn('Failed to decode svedit data from HTML:', error);
		return null;
	}
}

/** Fallback HTML for nodes without an exporter: their text and node array content. */
function default_node_html_exporter(
	node: DocumentNode,
	session: AnySession,
	html_exporters: Record<string, NodeHtmlExporter>
): string {
	let html = '';
	const properties = session.schema[node.type].properties;
	for (const [name, value] of Object.entries(node)) {
		const type = properties[name]?.type;
		if (type === 'text' && value.content.trim()) {
			html += `<p>${export_text_html(value, session)}</p>`;
		} else if (type === 'node_array') {
			for (const child_id of value.nodes)
				html += export_node_html(session.get(child_id), session, html_exporters);
		}
	}
	return html;
}

function export_node_html(
	node: DocumentNode,
	session: AnySession,
	html_exporters: Record<string, NodeHtmlExporter>
) {
	return (html_exporters[node.type] || default_node_html_exporter)(node, session, html_exporters);
}

/** Plain text of nodes: their non-empty text properties, as paragraphs. */
function export_plain_text(nodes: DocumentNode[]): string {
	let plain_text = '';
	for (const node of nodes) {
		for (const [name, value] of Object.entries(node)) {
			if (name === 'id' || name === 'type' || typeof value?.content !== 'string') continue;
			if (value.content.trim()) plain_text += `${value.content.trim()}\n\n`;
		}
	}
	return plain_text.trim();
}

/** Write the current selection to the clipboard. */
export function copy_selection(
	session: AnySession,
	clipboard_data: DataTransfer | null | undefined
): void {
	const selection = session.selection;
	let plain_text = '';
	let html = '';
	if (selection?.type === 'text') {
		const text = session.get_selected_text()!;
		plain_text = session.get_selected_plain_text()!;
		html = encode_clipboard_html(
			text,
			`<span>${export_text_html(text, session, text.nodes)}</span>`
		);
	} else if (selection?.type === 'node') {
		const payload = session.get_selected_annotated_nodes()!;
		const nodes = payload.main_nodes.map((id) => payload.nodes[id]);
		const html_exporters = session.config.html_exporters || {};
		const fallback_html = nodes
			.map((node) => export_node_html(node, session, html_exporters))
			.join('');
		html = encode_clipboard_html(payload, fallback_html);
		plain_text = export_plain_text(nodes);
	} else if (selection?.type === 'property') {
		const { name, type } = session.inspect(selection.path);
		const value = session.get(selection.path);
		const fallback_html =
			type === 'text' ? export_text_html(value, session) : escape_html(String(value));
		html = encode_clipboard_html(
			{ kind: 'property', name, type, value },
			`<span>${fallback_html}</span>`
		);
		plain_text = type === 'text' ? value.content : String(value);
	}
	try {
		clipboard_data?.setData('text/plain', plain_text);
		clipboard_data?.setData('text/html', html);
	} catch (error) {
		console.error('Failed to copy data: ', error);
	}
}

/** The node caret right after the node owning a text selection. */
function caret_after_text(selection: Selection): NodeSelection {
	const index = selection.path.at(-2) as number;
	return {
		type: 'node',
		path: selection.path.slice(0, -2),
		anchor_offset: index + 1,
		focus_offset: index + 1
	};
}

/**
 * Where nodes go for a selection: the node selection itself, the next
 * ancestor insert caret, or the end of the root's body (or first) node array.
 */
function get_target_node_caret(session: AnySession, root_path: DocumentPath): NodeSelection | null {
	const selection = session.selection;
	if (selection?.type === 'node') return selection;
	const next = session.get_next_node_insert_caret(selection);
	if (next?.type === 'node') return next;

	const properties = session.schema[session.get(root_path)?.type]?.properties;
	if (!properties) return null;
	const name =
		properties.body?.type === 'node_array'
			? 'body'
			: Object.keys(properties).find((name) => properties[name].type === 'node_array');
	if (!name) return null;
	const node_array = session.get([...root_path, name]);
	if (!Array.isArray(node_array?.nodes)) return null;
	const end = node_array.nodes.length;
	return { type: 'node', path: [...root_path, name], anchor_offset: end, focus_offset: end };
}

/**
 * Paste a node payload at a node caret (or the current node selection).
 * Disallowed text-like nodes are converted to the default text node type.
 * If any node can't be inserted, the next ancestor caret is tried.
 */
function try_node_paste(
	session: AnySession,
	payload: DynamicRecord | null,
	selection?: Selection | null
): boolean {
	const { nodes, main_nodes, marks = [], annotations = [] } = payload || {};
	if (!nodes || !main_nodes?.length) return false;
	const target = selection || session.selection;
	if (target?.type !== 'node') return false;
	const definition = session.inspect(target.path);
	if (definition?.type !== 'node_array') return false;

	const tr = session.tr;
	if (selection) tr.set_selection(selection);
	const text_type = get_default_text_node(definition, session.schema);
	const text_property = get_text_property_name(text_type, session.schema);
	// Decided for the whole clipboard graph, before any node is created
	const preserve_ids = Object.values(nodes).every((node: DocumentNode) => !tr.doc.nodes[node.id]);
	const node_ids: string[] = [];
	for (const node_id of main_nodes) {
		const node = nodes[node_id];
		if (node && definition.node_types.includes(node.type)) {
			node_ids.push(tr.build(node_id, nodes, { preserve_ids }));
		} else if (
			node &&
			text_type &&
			text_property &&
			is_text_like_node_payload(node, session.schema)
		) {
			// Building from the clipboard graph keeps the text's marks and annotations
			const content = get_text_content(node, session.schema) || EMPTY_TEXT();
			const converted = { id: node_id, type: text_type, [text_property]: content };
			node_ids.push(tr.build(node_id, { ...nodes, [node_id]: converted }, { preserve_ids }));
		} else {
			const next =
				tr.selection.path.length >= 2 && session.get_next_node_insert_caret(tr.selection);
			return next ? try_node_paste(session, payload, next) : false;
		}
	}
	tr.insert_nodes(node_ids, marks, annotations, nodes, { preserve_ids });
	session.apply(tr);
	return true;
}

/** Import external HTML via config.html_paste. Returns false if nothing was pasted. */
function try_html_paste(session: AnySession, html: string, root_path: DocumentPath): boolean {
	const config = session.config.html_paste;
	const selection = session.selection;
	if (!config || !selection) return false;
	const blocks = parse_html_paste(html);
	if (!blocks.length) return false;
	const paste_blocks = (caret: NodeSelection | null) => {
		const payload =
			caret &&
			map_html_blocks(
				blocks,
				config,
				session.schema,
				session.inspect(caret.path) as unknown as PropertyDefinition
			);
		return !!payload && try_node_paste(session, payload, caret);
	};

	if (selection.type !== 'text') return paste_blocks(get_target_node_caret(session, root_path));
	// Several blocks or a list become nodes after a text node
	const owner = session.get(selection.path.slice(0, -1));
	const as_nodes =
		blocks.length > 1 ||
		blocks.some(
			(block) => 'items' in block && (config.lists?.[block.tag] || block.items.flat().length > 1)
		);
	if (
		as_nodes &&
		owner &&
		session.kind(owner) === 'text' &&
		paste_blocks(caret_after_text(selection))
	)
		return true;
	const nodes: Record<string, DocumentNode> = {};
	const definition = session.inspect(selection.path) as unknown as PropertyDefinition;
	const text = map_html_text(blocks, config, session.schema, definition, nodes);
	session.apply(session.tr.insert_text(text.content, text.marks, [], nodes));
	return true;
}

/** Paste clipboard content at the current selection. */
export async function paste(
	session: AnySession,
	clipboard_data: DataTransfer | null | undefined,
	root_path: DocumentPath
): Promise<void> {
	let payload: DynamicRecord | null | undefined;
	let plain_text: string | undefined;
	const media = [...(clipboard_data?.items ?? [])]
		.filter((item) => /^(image|video|audio)\//.test(item.type))
		.map((item) => {
			const blob = item.getAsFile()!;
			return { blob, data_url: URL.createObjectURL(blob), type: item.type, size: blob.size };
		});

	if (media.length > 0) {
		const handle_media_paste =
			session.config.handle_media_paste || session.config.handle_image_paste;
		payload = await handle_media_paste(session, media);
		// Without a payload, the handler took care of creating content
		if (!payload) return;
	} else {
		let html: string | undefined;
		try {
			html = clipboard_data?.getData('text/html');
			if (html) payload = decode_clipboard_html(html);
		} catch {
			payload = undefined;
		}
		try {
			plain_text = clipboard_data?.getData('text/plain');
		} catch (error) {
			console.error('Failed to paste any content:', error);
		}
		if (!payload && html && session.config.html_paste) {
			try {
				if (try_html_paste(session, html, root_path)) return;
			} catch (error) {
				console.warn('Failed to import pasted HTML; falling back to plain text:', error);
			}
		}
		if (!payload && typeof plain_text === 'string') {
			plain_text = dedent_plain_text(normalize_line_endings(plain_text));
			const paragraphs = split_plain_text_paragraphs(plain_text);
			const selection = session.selection;
			if (selection?.type === 'text') {
				const definition = session.inspect(selection.path);
				if (definition?.type === 'text' && !definition.allow_newlines) {
					plain_text = normalize_plain_text_for_single_line_property(plain_text);
				}
				// Several paragraphs in a text node become text nodes after it
				const owner = session.get(selection.path.slice(0, -1));
				if (owner && session.kind(owner) === 'text' && paragraphs.length > 1) {
					const text_type = get_default_text_node(
						session.inspect(selection.path.slice(0, -2)),
						session.schema
					);
					const nodes_payload = create_plain_text_nodes_payload(
						paragraphs,
						text_type,
						session.schema
					);
					if (nodes_payload && try_node_paste(session, nodes_payload, caret_after_text(selection)))
						return;
				}
			} else {
				const caret = get_target_node_caret(session, root_path);
				if (caret) {
					const text_type = get_default_text_node(session.inspect(caret.path), session.schema);
					payload = create_plain_text_nodes_payload(paragraphs, text_type, session.schema);
				}
			}
		}
	}

	const selection = session.selection;
	const single_node =
		payload?.main_nodes?.length === 1 ? payload.nodes?.[payload.main_nodes[0]] : null;
	if (payload?.main_nodes && selection?.type === 'node') {
		try_node_paste(session, payload);
	} else if (payload?.kind === 'property' && selection?.type === 'property') {
		const { type } = session.inspect(selection.path);
		if (type !== payload.type) return;
		if (type === 'node') {
			const tr = session.tr;
			const id = tr.build('some_new_node_id', {
				some_new_node_id: { ...payload.value, id: 'some_new_node_id' }
			});
			session.apply(tr.set(selection.path, id));
		} else {
			// A value type, such as string or number
			session.apply(session.tr.set(selection.path, payload.value));
		}
	} else if (selection?.type === 'text' && payload?.content) {
		session.apply(
			session.tr.insert_text(payload.content, payload.marks, payload.annotations, payload.nodes)
		);
	} else if (
		selection?.type === 'text' &&
		single_node &&
		is_text_like_node_payload(single_node, session.schema)
	) {
		const text = get_text_content(single_node, session.schema);
		if (text)
			session.apply(
				session.tr.insert_text(text.content, text.marks, text.annotations, payload!.nodes)
			);
	} else if ((selection?.type === 'text' || selection?.type === 'property') && payload?.nodes) {
		const caret = get_target_node_caret(session, root_path);
		if (caret) try_node_paste(session, payload, caret);
	} else if (typeof plain_text === 'string') {
		// External paste without Svedit data
		session.apply(session.tr.insert_text(plain_text));
	}
}
