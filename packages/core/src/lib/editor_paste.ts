// Paste strategies and node insert carets shared by the Svelte, React and
// Vue editor components: where pasted nodes go, how clipboard payloads and
// pasted HTML are inserted, and the paste handler that ties them together.
import type Session from './Session.js';
import type {
	DocumentNode,
	DocumentPath,
	DocumentSchema,
	DynamicRecord,
	NodeSelection,
	PropertyDefinition,
	Selection
} from './types.js';
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
import { parse_html_paste, map_html_text, map_html_blocks } from './html_paste.js';
import { extract_svedit_data_from_html } from './clipboard.js';

/**
 * The node caret at the end of the root node's main node array (`body`, or
 * the first node_array property), used when no closer insert caret exists.
 * @param session - The session
 * @param path - The path to the root node rendered by the editor
 */
export function get_root_node_insert_caret<S extends DocumentSchema>(
	session: Session<S>,
	path: DocumentPath
): NodeSelection | null {
	const root_node = session.get(path);
	const root_schema = root_node ? session.schema[root_node.type] : null;
	if (!root_schema?.properties) return null;

	const preferred_property_name =
		root_schema.properties.body?.type === 'node_array'
			? 'body'
			: Object.entries(root_schema.properties).find(([, property_definition]) => {
					return property_definition.type === 'node_array';
				})?.[0];
	if (!preferred_property_name) return null;

	const node_array_path = [...path, preferred_property_name];
	const node_array = session.get(node_array_path);
	if (!node_array || !Array.isArray(node_array.nodes)) return null;

	return {
		type: 'node' as const,
		path: node_array_path,
		anchor_offset: node_array.nodes.length,
		focus_offset: node_array.nodes.length
	};
}

/**
 * The node caret where nodes should be inserted for the given selection: the
 * selection itself when it is a node selection, otherwise the next node
 * insert caret, falling back to the root node's insert caret.
 * @param session - The session
 * @param path - The path to the root node rendered by the editor
 * @param selection - The selection to resolve (defaults to the session's)
 */
export function get_target_node_insert_caret<S extends DocumentSchema>(
	session: Session<S>,
	path: DocumentPath,
	selection: Selection | null = session.selection
): NodeSelection | null {
	if (selection?.type === 'node') {
		return selection;
	}

	const next_node_insert_caret = session.get_next_node_insert_caret(selection);
	if (next_node_insert_caret?.type === 'node') {
		return next_node_insert_caret;
	}

	return get_root_node_insert_caret(session, path);
}

/**
 * The node caret right after the text node that owns a text selection.
 * @param selection - The selection to resolve
 */
export function get_node_insert_caret_after_text_selection(
	selection: Selection | null
): NodeSelection | null {
	if (selection?.type !== 'text') return null;
	const node_index = selection.path.at(-2) as number;

	return {
		type: 'node' as const,
		path: selection.path.slice(0, -2),
		anchor_offset: node_index + 1,
		focus_offset: node_index + 1
	};
}

/**
 * Attempts to paste JSON data as a node at the current selection.
 *
 * @param session - The session to paste into
 * @param pasted_json - The JSON data to paste, either as a string or parsed object
 * @param selection - Optional selection (node caret) where the payload should be pasted
 * @returns True if the paste operation was successful, false otherwise
 */
export function try_node_paste<S extends DocumentSchema>(
	session: Session<S>,
	pasted_json: DynamicRecord | null,
	selection?: Selection
): boolean {
	const { nodes, main_nodes, marks = [], annotations = [] } = pasted_json || {};
	if (!nodes || !main_nodes?.length) return false;

	const target_selection = selection || session.selection;
	if (target_selection?.type !== 'node') return false;
	const property_definition = session.inspect(target_selection.path);
	if (property_definition?.type !== 'node_array') return false;

	const tr = session.tr;
	if (selection) tr.set_selection(selection);

	const default_text_node_type = get_default_text_node(property_definition, session.schema);
	const target_text_property_name = get_text_property_name(default_text_node_type, session.schema);

	// Decide for the whole clipboard graph before creating any nodes or replacing the selection.
	const preserve_ids = Object.values(nodes).every((node: DocumentNode) => !tr.doc.nodes[node.id]);
	const nodes_to_insert = [];
	let rejected = false;
	for (const node_id of main_nodes) {
		const node = nodes[node_id];
		if (!node) {
			rejected = true;
			break;
		}

		if (!property_definition.node_types.includes(node.type)) {
			const text_content = get_text_content(node, session.schema);
			if (
				is_text_like_node_payload(node, session.schema) &&
				default_text_node_type &&
				target_text_property_name
			) {
				// Keep the clipboard graph so converted text retains its marks and annotations.
				const new_node_id = tr.build(
					node_id,
					{
						...nodes,
						[node_id]: {
							id: node_id,
							type: default_text_node_type,
							[target_text_property_name]: text_content || {
								content: '',
								marks: [],
								annotations: []
							}
						}
					},
					{ preserve_ids }
				);
				nodes_to_insert.push(new_node_id);
			} else {
				rejected = true;
				break;
			}
		} else {
			const new_node_id = tr.build(node_id, nodes, { preserve_ids });
			nodes_to_insert.push(new_node_id);
		}
	}

	if (!rejected) {
		tr.insert_nodes(nodes_to_insert, marks, annotations, nodes, { preserve_ids });
		session.apply(tr);
		return true;
	}

	if (tr.selection.path.length >= 2) {
		const next_node_insert_caret = session.get_next_node_insert_caret(tr.selection);
		if (next_node_insert_caret) {
			return try_node_paste(session, pasted_json, next_node_insert_caret);
		}
	}
	return false;
}

/**
 * Imports pasted HTML through the session's `html_paste` config, either as
 * text at a text selection or as nodes at the target node insert caret.
 * @param session - The session to paste into
 * @param path - The path to the root node rendered by the editor
 * @param html - The pasted HTML
 * @returns True if the HTML was imported, false otherwise
 */
export function try_html_paste<S extends DocumentSchema>(
	session: Session<S>,
	path: DocumentPath,
	html: string
): boolean {
	const config = session.config.html_paste;
	const selection = session.selection;
	if (!config || !selection) return false;
	const blocks = parse_html_paste(html);
	if (!blocks.length) return false;
	if (selection.type === 'text') {
		const owner = session.get(selection.path.slice(0, -1));
		const insert_as_nodes =
			blocks.length > 1 ||
			blocks.some(
				(block) => 'items' in block && (config.lists?.[block.tag] || block.items.flat().length > 1)
			);
		if (insert_as_nodes && owner && session.kind(owner) === 'text') {
			const caret = get_node_insert_caret_after_text_selection(selection);
			if (caret) {
				const payload = map_html_blocks(
					blocks,
					config,
					session.schema,
					session.inspect(caret.path) as unknown as PropertyDefinition
				);
				if (payload && try_node_paste(session, payload, caret)) return true;
			}
		}
		const nodes: Record<string, DocumentNode> = {};
		const text = map_html_text(
			blocks,
			config,
			session.schema,
			session.inspect(selection.path) as unknown as PropertyDefinition,
			nodes
		);
		session.apply(session.tr.insert_text(text.content, text.marks, [], nodes));
		return true;
	}
	const caret = get_target_node_insert_caret(session, path, selection);
	if (!caret) return false;
	const payload = map_html_blocks(
		blocks,
		config,
		session.schema,
		session.inspect(caret.path) as unknown as PropertyDefinition
	);
	return !!payload && try_node_paste(session, payload, caret);
}

/**
 * Pastes the clipboard event's content into the session: media through the
 * config's media paste handler, otherwise embedded svedit data, imported
 * HTML or plain text. The editor component checks that it is editable and
 * that the canvas has focus before calling this.
 * @param session - The session to paste into
 * @param path - The path to the root node rendered by the editor
 * @param event - The clipboard event
 */
export async function handle_paste<S extends DocumentSchema>(
	session: Session<S>,
	path: DocumentPath,
	event: ClipboardEvent
): Promise<void> {
	event.preventDefault();

	let html_content, plain_text, pasted_json;
	const pasted_media = [];

	// NOTE: For some reason, await navigator.clipboard.read()
	const clipboard_items = event.clipboardData?.items || [];
	for (const item of clipboard_items || []) {
		if (
			item.type.startsWith('image/') ||
			item.type.startsWith('video/') ||
			item.type.startsWith('audio/')
		) {
			const blob = item.getAsFile();
			const data_url = URL.createObjectURL(blob);
			pasted_media.push({
				blob,
				data_url,
				type: item.type,
				size: blob.size
			});
		}
	}

	if (pasted_media.length > 0) {
		const handle_media_paste =
			session.config.handle_media_paste || session.config.handle_image_paste;
		pasted_json = await handle_media_paste(session, pasted_media);
		// NOTE: If no pasted_json is returned from the custom handler, we assume that content creation has been
		// handled inside handle_media_paste already.
		if (!pasted_json) return;
	} else {
		// First try to extract svedit data from HTML format
		try {
			html_content = event.clipboardData?.getData('text/html');
			if (html_content) {
				pasted_json = extract_svedit_data_from_html(html_content);
			}
		} catch {
			// No HTML format available or failed to extract svedit data
			pasted_json = undefined;
		}

		try {
			plain_text = event.clipboardData?.getData('text/plain');
		} catch (e) {
			console.error('Failed to paste any content:', e);
		}

		if (!pasted_json && html_content && session.config.html_paste) {
			try {
				if (try_html_paste(session, path, html_content)) return;
			} catch (error) {
				console.warn('Failed to import pasted HTML; falling back to plain text:', error);
			}
		}

		// Try to construct a node payload from plain text when applicable
		if (!pasted_json && typeof plain_text === 'string') {
			plain_text = normalize_line_endings(plain_text);
			plain_text = dedent_plain_text(plain_text);
			const plain_text_fragments = split_plain_text_paragraphs(plain_text);
			const has_multiple_paragraphs = plain_text_fragments.length > 1;

			if (session.selection?.type === 'text') {
				const property_definition = session.inspect(session.selection.path);
				if (property_definition?.type === 'text' && !property_definition.allow_newlines) {
					plain_text = normalize_plain_text_for_single_line_property(plain_text);
				}

				const owner_node = session.get(session.selection.path.slice(0, -1));
				const owner_is_text_node = owner_node && session.kind(owner_node) === 'text';

				if (owner_is_text_node && has_multiple_paragraphs) {
					const node_array_property_definition = session.inspect(
						session.selection.path.slice(0, -2)
					);
					const default_text_node_type = get_default_text_node(
						node_array_property_definition,
						session.schema
					);
					const node_insert_caret = get_node_insert_caret_after_text_selection(session.selection);
					const plain_text_nodes_payload = create_plain_text_nodes_payload(
						plain_text_fragments,
						default_text_node_type,
						session.schema
					);

					if (node_insert_caret && plain_text_nodes_payload) {
						const did_paste_nodes = try_node_paste(
							session,
							plain_text_nodes_payload,
							node_insert_caret
						);
						if (did_paste_nodes) {
							return;
						}
					}
				}
			} else {
				const target_node_insert_caret = get_target_node_insert_caret(
					session,
					path,
					session.selection
				);
				if (target_node_insert_caret) {
					const node_array_property_definition = session.inspect(target_node_insert_caret.path);
					const default_text_node_type = get_default_text_node(
						node_array_property_definition,
						session.schema
					);
					pasted_json = create_plain_text_nodes_payload(
						plain_text_fragments,
						default_text_node_type,
						session.schema
					);
				}
			}
		}
	}

	// console.log('plain_text', plain_text);
	// console.log('pasted_json', pasted_json);

	if (pasted_json?.main_nodes && session.selection?.type === 'node') {
		// Paste nodes at a node selection
		try_node_paste(session, pasted_json);
	} else if (pasted_json?.kind === 'property' && session.selection?.type === 'property') {
		const property_definition = session.inspect(session.selection.path);
		if (property_definition.type === pasted_json.type) {
			if (property_definition.type === 'node') {
				const tr = session.tr;
				const new_id = tr.build('some_new_node_id', {
					some_new_node_id: {
						...pasted_json.value,
						id: 'some_new_node_id'
					}
				});
				tr.set(session.selection.path, new_id);
				session.apply(tr);
			} else {
				// we assume that we have a value type for the property (string, number)
				session.apply(session.tr.set(session.selection.path, pasted_json.value));
			}
		}
	} else if (session.selection?.type === 'text' && pasted_json?.content) {
		// Paste text at a text selection
		session.apply(
			session.tr.insert_text(
				pasted_json.content,
				pasted_json.marks,
				pasted_json.annotations,
				pasted_json.nodes
			)
		);
	} else if (
		session.selection?.type === 'text' &&
		pasted_json?.main_nodes?.length === 1 &&
		is_text_like_node_payload(pasted_json?.nodes[pasted_json.main_nodes[0]], session.schema)
	) {
		// Paste a single text node, at a text caret
		const text_property = get_text_content(
			pasted_json.nodes[pasted_json.main_nodes[0]],
			session.schema
		);
		if (text_property) {
			session.apply(
				session.tr.insert_text(
					text_property.content,
					text_property.marks,
					text_property.annotations,
					pasted_json.nodes
				)
			);
		}
	} else if (['text', 'property'].includes(session.selection?.type) && pasted_json?.nodes) {
		// Paste nodes at a text or property selection by finding the next valid insert caret
		const target_node_insert_caret = get_target_node_insert_caret(session, path, session.selection);
		if (target_node_insert_caret) {
			try_node_paste(session, pasted_json, target_node_insert_caret);
		}
	} else if (typeof plain_text === 'string') {
		// External paste: Fallback to plain text when no svedit data is found
		session.apply(session.tr.insert_text(plain_text));
	}
}
