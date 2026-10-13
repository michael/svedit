// Clipboard format and node exporters shared by the Svelte, React and Vue
// editor components: the HTML clipboard payload with embedded Svedit data,
// the default HTML and plain-text node exporters, and the copy handler.
import type Session from './Session.js';
import type { DocumentNode, DocumentSchema, DynamicRecord, NodeHtmlExporter } from './types.js';
import { export_text_html } from './html_export.js';
import { escape_html } from './html_utils.js';

/**
 * Creates HTML clipboard format with embedded svedit data
 * @param json_data - The svedit data to embed
 * @param fallback_html - HTML for cross-app compatibility
 * @returns HTML with embedded svedit data
 */
export function create_svedit_html_format(json_data: unknown, fallback_html: string): string {
	// Use encodeURIComponent to handle Unicode, then base64 encode
	const json_string = JSON.stringify(json_data);
	const encoded_data = btoa(encodeURIComponent(json_string));

	return `<meta charset="utf-8">
<div>
  <span data-svedit="${encoded_data}"></span>
</div>
${fallback_html}`;
}

/**
 * Extracts svedit data from HTML clipboard format
 * @param html - HTML content from clipboard
 * @returns Parsed svedit data or null if not found
 */
export function extract_svedit_data_from_html(html: string): DynamicRecord | null {
	const svedit_regex = /data-svedit="([^"]+)"/;
	const match = html.match(svedit_regex);

	if (match && match[1]) {
		try {
			// Decode base64, then decode URI component to handle Unicode
			const base64_decoded = atob(match[1]);
			const decoded_data = decodeURIComponent(base64_decoded);
			return JSON.parse(decoded_data);
		} catch (e) {
			console.warn('Failed to decode svedit data from HTML:', e);
			return null;
		}
	}

	return null;
}

/**
 * Default node exporter for nodes without specific exporters
 * @param node - Node object
 * @returns HTML representation
 */
export function default_node_html_exporter<S extends DocumentSchema>(
	node: DocumentNode,
	session: Session<S>,
	html_exporters: Record<string, NodeHtmlExporter<S>>
): string {
	let html = '';
	const node_schema = session.schema[node.type];

	for (const [prop_name, prop_value] of Object.entries(node)) {
		if (prop_name === 'id' || prop_name === 'type') continue;
		const property_definition = node_schema.properties[prop_name];
		// Check if this is a text property.
		if (property_definition?.type === 'text') {
			const text_content = prop_value.content;
			if (text_content.trim()) {
				html += `<p>${export_text_html(prop_value, session)}</p>`;
			}
		} else if (property_definition?.type === 'node_array') {
			for (const child_id of prop_value.nodes) {
				const child = session.get(child_id);
				const child_exporter = html_exporters[child.type] || default_node_html_exporter;
				html += child_exporter(child, session, html_exporters);
			}
		}
	}
	return html;
}

export function default_node_plain_text_exporter(node: DocumentNode): string {
	let plain_text = '';

	for (const [prop_name, prop_value] of Object.entries(node)) {
		if (prop_name === 'id' || prop_name === 'type') continue;

		// Check if this is a text property value.
		if (
			typeof prop_value === 'object' &&
			prop_value !== null &&
			typeof prop_value.content === 'string'
		) {
			const text_content = prop_value.content;
			if (text_content.trim()) {
				plain_text += `${text_content.trim()}\n\n`;
			}
		}
	}

	return plain_text;
}

/**
 * Exports nodes to HTML using document config exporters
 * @param nodes - Array of node objects
 * @param session - The session whose config provides the exporters
 * @returns HTML representation
 */
export function export_html<S extends DocumentSchema>(
	nodes: DocumentNode[],
	session: Session<S>
): string {
	let html = '';

	for (const node of nodes) {
		const html_exporters = session.config.html_exporters || {};

		if (html_exporters[node.type]) {
			// Use custom exporter for this node type
			html += html_exporters[node.type](node, session, html_exporters);
		} else {
			// Use default exporter
			html += default_node_html_exporter(node, session, html_exporters);
		}
	}
	return html;
}

export function export_plain_text(nodes: DocumentNode[]): string {
	let plain_text = '';

	for (const node of nodes) {
		plain_text += default_node_plain_text_exporter(node);
	}
	return plain_text.trim();
}

/**
 * Writes the session's selection to the clipboard event as plain text and
 * as HTML with embedded svedit data. The editor component checks that it is
 * editable and that the canvas has focus before calling this.
 * @param session - The session whose selection is copied
 * @param event - The clipboard event
 * @param delete_selection - used by oncut()
 */
export function handle_copy<S extends DocumentSchema>(
	session: Session<S>,
	event: ClipboardEvent,
	delete_selection = false
): void {
	event.preventDefault();
	event.stopPropagation();

	let plain_text, text, html;

	if (session.selection?.type === 'text') {
		plain_text = session.get_selected_plain_text();
		text = session.get_selected_text();
		const fallback_html = `<span>${export_text_html(text, session, text.nodes)}</span>`;

		// console.log('Text copy:', {
		// 	text,
		// 	plain_text,
		// 	html
		// });

		html = create_svedit_html_format(text, fallback_html);
	} else if (session.selection?.type === 'node') {
		const json_data = session.get_selected_annotated_nodes();
		const { nodes, main_nodes } = json_data;

		// console.log('Node copy:', {
		// 	selected_nodes,
		// 	nodes,
		// 	total_nodes: Object.keys(nodes).length,
		// 	operation: delete_selection ? 'cut' : 'copy'
		// });

		// Generate fallback HTML for cross-app compatibility
		const selected_node_objects = main_nodes.map((id) => nodes[id]);
		const fallback_html = export_html(selected_node_objects, session);

		// Create HTML with embedded svedit data
		html = create_svedit_html_format(json_data, fallback_html);
		// Generate plain text representation
		plain_text = export_plain_text(selected_node_objects);
	} else if (session.selection?.type === 'property') {
		const property_definition = session.inspect(session.selection.path);
		const value = session.get(session.selection.path);
		const json_data = {
			kind: 'property',
			name: property_definition.name,
			type: property_definition.type,
			value
		};
		const fallback_html =
			property_definition.type === 'text'
				? export_text_html(value, session)
				: escape_html(String(value));
		html = create_svedit_html_format(json_data, `<span>${fallback_html}</span>`);
		plain_text = property_definition.type === 'text' ? value.content : String(value);
	}

	// Write to clipboard using event.clipboardData
	try {
		event.clipboardData?.setData('text/plain', plain_text || '');
		event.clipboardData?.setData('text/html', html || '');
	} catch (err) {
		console.error('Failed to copy data: ', err);
	}

	if (delete_selection) {
		session.apply(session.tr.delete_selection());
	}
}
