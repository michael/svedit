<script>
	import { getContext, setContext } from 'svelte';
	import {
		snake_to_pascal,
		get_char_length,
		utf16_to_char_offset,
		char_to_utf16_offset,
		get_char_at
	} from './utils.js';

	/** @import {
	 *   SveditProps,
	 *   DocumentPath,
	 *   Selection,
	 *   TextSelection,
	 *   NodeSelection,
	 *   PropertySelection,
	 *   NodeId
	 * } from './types.d.ts';
	 */

	/** @type {SveditProps} */
	let {
		session,
		editable = $bindable(false),
		path,
		class: css_class,
		autocapitalize = 'on',
		spellcheck = 'true'
	} = $props();

	let canvas_el;
	let root_node = $derived(session.get(path));
	let Overlays = $derived(session.config.system_components.Overlays);
	let RootComponent = $derived(session.config.node_components[snake_to_pascal(root_node.type)]);

	let is_composing = $state(false);
	let before_composition_selection = null;

	// let is_mobile = $derived(is_mobile_browser());
	// let is_chrome_desktop = $derived(is_chrome_desktop_browser());

	/** Expose function so parent can call it */
	export { focus_canvas };

	const context = {
		get session() {
			return session;
		},
		get editable() {
			return editable;
		},
		set editable(value) {
			editable = value;
		},
		get is_composing() {
			return is_composing;
		},
		get canvas_el() {
			return canvas_el;
		},
		focus_canvas
	};

	setContext('svedit', context);

	// Get KeyMapper from context (may be undefined if not provided)
	const key_mapper = getContext('key_mapper');

	// Initialize commands and keymap on the session
	$effect(() => {
		session.initialize_commands(context);
	});

	// Handle focus - push session's keymap onto stack
	function handle_canvas_focus() {
		key_mapper?.push_scope(session.keymap);
	}

	// Handle blur - pop document's keymap from stack
	function handle_canvas_blur() {
		key_mapper?.pop_scope();
	}

	/**
	 * @param {InputEvent} event
	 */
	async function onbeforeinput(event) {
		// console.log(`onbeforeinput: ${event.inputType}, data: "${event.data}", isComposing: ${event.isComposing}`, event);

		if (event.inputType === 'historyUndo' && is_composing) {
			// Let the historyundo event pass through (when triggered from within oncompositionend)
			return;
		}

		// Sometimes the part that should be replaced is not the same as the current DOM selection
		// that's why we look into event.getTargetRanges()[0] if it exists.
		let target_selection;
		if (event.getTargetRanges?.()?.[0]) {
			target_selection = __get_text_selection_from_dom(event.getTargetRanges()[0]);
		}

		// While composing, Svedit does nothing and lets the oncompositionend
		// event handle the final replacement.
		if (event.isComposing) {
			// NOTE: We only capture the initial selection right after the composition started
			// We're not interested in the target selections during the composition.
			if (!before_composition_selection) {
				before_composition_selection = target_selection;
			}
			return;
		}

		// NOTE: in cases we can't reliably map event.getTargetRanges()[0] to a session selection,
		// the original session.selection is used.
		if (target_selection) {
			session.selection = target_selection;
		}

		// Only take input when in a valid text selection inside the canvas
		if (!canvas_el?.contains(document.activeElement)) {
			event.preventDefault();
			return;
		}

		if (event.inputType === 'formatBold' && session.selection?.type === 'text') {
			session.apply(session.tr.annotate_text('strong'));
			event.preventDefault();
			event.stopPropagation();
		}

		if (event.inputType === 'formatItalic' && session.selection?.type === 'text') {
			session.apply(session.tr.annotate_text('emphasis'));
			event.preventDefault();
			event.stopPropagation();
		}

		// NOTE: underline doesn't make much sense as a semantic annotation,
		// so we rewire `cmd + u` to toggle highlights
		if (event.inputType === 'formatUnderline' && session.selection?.type === 'text') {
			session.apply(session.tr.annotate_text('highlight'));
			event.preventDefault();
			event.stopPropagation();
		}

		if (
			['deleteContentBackward', 'deleteWordBackward', 'deleteContent'].includes(event.inputType)
		) {
			session.apply(session.tr.delete_selection('backward'));
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (['deleteContentForward', 'deleteWordForward'].includes(event.inputType)) {
			session.apply(session.tr.delete_selection('forward'));
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		// For now I reject drag+drop text movements.
		// TODO: If I want to support those, I need to handle them in such a way that
		// you can drag from one text property to another too.
		if (event.inputType === 'deleteByDrag' || event.inputType === 'insertFromDrop') {
			event.preventDefault();
			return;
		}

		// Insert the character, unless there is none.
		let inserted_text = event.data;

		// Sometimes (e.g. for replacements) the inserted_text is available via
		// event.dataTransfer, not event.data
		if (!inserted_text && event.dataTransfer) {
			inserted_text = event.dataTransfer?.getData('text/plain');
		}

		// Skip, if there's no inserted_text at all
		if (!inserted_text) {
			event.preventDefault();
			return;
		}

		const tr = session.tr;
		tr.insert_text(inserted_text);
		session.apply(tr, { batch: true });
		event.preventDefault();
	}

	/**
	 * Handles composition start events for input methods like dead keys
	 * This occurs when user starts typing a composed character (e.g., backtick for accents)
	 * @param {CompositionEvent} event
	 */
	function oncompositionstart(event) {
		console.log('DEBUG: oncompositionstart', event.data);
		if (session.selection.type !== 'text') {
			// Remove all ranges - completely clears the selection
			window.getSelection()?.removeAllRanges();

			// Restore
			setTimeout(() => {
				render_selection();
			}, 0);
			return;
		}

		// Disable keydown event handling during composition. This way, you can confirm
		// a diacritic (a->ä) with ENTER without causing a line break.
		key_mapper.skip_onkeydown = true;
		is_composing = true;
		return;
	}

	/**
	 * Handles composition end events for input methods like dead keys
	 * This occurs when composition is complete (e.g., after typing 'a' following backtick to get 'à')
	 */
	function oncompositionend(event) {
		console.log('DEBUG: oncompositionend, insert:', event.data, event);
		if (!canvas_el?.contains(document.activeElement)) return;
		if (canvas_el?.contains(document.activeElement) && session.selection?.type === 'text') {
			// We need to remember the user's selection, as it might have changed in the process
			// of finishing a composition. For instance, the user might have selected a different
			// part of the text while composing.
			const user_selection = __get_selection_from_dom();

			// HACK: In order to restore the DOM state from before composition, we just run contenteditable's
			// native undo command. Then the DOM will be in sync again with the editor's internal state.
			document.execCommand('undo', false, null);

			// Set the selection to where the user initiated the composition, make changes, and apply.
			// NOTE: We need to check for valid selection here, as there is a rare race condition
			// where the user had no text selection at the start of composition.
			if (before_composition_selection) {
				session.selection = before_composition_selection;
				console.log('event.data', event.data);
				const tr = session.tr;
				tr.insert_text(event.data);
				session.apply(tr);
				// Recover user selection after composition. This assumes that document positions of natively
				// modified DOM (before transaction applied) are equal to the positions after the transaction.
				session.selection = user_selection;
			}

			// NOTE: We need a little timeout to nudge Safari into not handling the
			// ENTER press when confirming a diacritic
			setTimeout(() => {
				key_mapper.skip_onkeydown = false;
				is_composing = false;
			}, 100);
		}

		// Reset before_composition_selection, so we are ready for capturing the starting selection
		// of the next composition.
		before_composition_selection = null;
		return;
	}

	// Map DOM selection to internal model
	function onselectionchange() {
		if (!editable) return;
		const dom_selection = window.getSelection();
		if (!dom_selection.rangeCount) return;

		// Only handle selection changes if selection is within the canvas
		const range = dom_selection.getRangeAt(0);
		if (!canvas_el?.contains(range.commonAncestorContainer)) return;
		let selection = __get_selection_from_dom();
		if (selection) {
			session.selection = selection;
		}
	}

	/**
	 * Creates HTML clipboard format with embedded svedit data
	 * @param {Object} json_data - The svedit data to embed
	 * @param {string} fallback_html - HTML for cross-app compatibility
	 * @returns {string} HTML with embedded svedit data
	 */
	function create_svedit_html_format(json_data, fallback_html) {
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
	 * @param {string} html - HTML content from clipboard
	 * @returns {Object|null} Parsed svedit data or null if not found
	 */
	function extract_svedit_data_from_html(html) {
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
	 * @param {Object} node - Node object
	 * @returns {string} HTML representation
	 */
	function default_node_html_exporter(node, session, html_exporters) {
		let html = '';
		const node_schema = session.schema[node.type];

		for (const [prop_name, prop_value] of Object.entries(node)) {
			if (prop_name === 'id' || prop_name === 'type') continue;
			const property_definition = node_schema.properties[prop_name];
			// Check if this is an annotated_text property (object with text property)
			if (property_definition.type === 'annotated_text') {
				const text_content = prop_value.text;
				if (text_content.trim()) {
					html += `<p>${text_content}</p>`;
				}
			} else if (property_definition.type === 'node_array') {
				for (const child_id of prop_value) {
					const child = session.get(child_id);
					const child_exporter = html_exporters[child.type] || default_node_html_exporter;
					html += child_exporter(child, session, html_exporters);
				}
			}
		}
		return html;
	}

	function default_node_plain_text_exporter(node) {
		let plain_text = '';

		for (const [prop_name, prop_value] of Object.entries(node)) {
			if (prop_name === 'id' || prop_name === 'type') continue;

			// Check if this is an annotated_text property (object with text property)
			if (
				typeof prop_value === 'object' &&
				prop_value !== null &&
				typeof prop_value.text === 'string'
			) {
				const text_content = prop_value.text;
				if (text_content.trim()) {
					plain_text += `${text_content.trim()}\n\n`;
				}
			}
		}

		return plain_text;
	}

	/**
	 * Exports nodes to HTML using document config exporters
	 * @param {Object[]} nodes - Array of node objects
	 * @returns {string} HTML representation
	 */
	function export_html(nodes) {
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

	function export_plain_text(nodes) {
		let plain_text = '';

		for (const node of nodes) {
			plain_text += default_node_plain_text_exporter(node);
		}
		return plain_text.trim();
	}

	/**
	 * @param {NodeId[]} selected_node_ids
	 */
	function prepare_copy_payload(selected_node_ids) {
		const nodes = {};

		// Get subgraph for each selected node using session.traverse()
		for (const node_id of selected_node_ids) {
			const subgraph = session.traverse(node_id);

			// Add all nodes from this subgraph to our nodes collection
			for (const node of subgraph) {
				if (!nodes[node.id]) {
					nodes[node.id] = node;
				}
			}
		}

		// Keep original IDs - we'll generate new ones during paste
		return { nodes, main_nodes: selected_node_ids };
	}

	/**
	 * @param {ClipboardEvent} event
	 * @param {boolean} delete_selection - used by oncut()
	 */
	function oncopy(event, delete_selection = false) {
		// Only handle copy events if focus is within the canvas
		if (!canvas_el?.contains(document.activeElement)) return;

		event.preventDefault();
		event.stopPropagation();

		let plain_text, annotated_text, html;

		if (session.selection?.type === 'text') {
			plain_text = session.get_selected_plain_text();
			annotated_text = session.get_selected_annotated_text();
			const fallback_html = `<span>${annotated_text.text}</span>`;

			console.log('Text copy:', {
				annotated_text,
				plain_text,
				html
			});

			html = create_svedit_html_format(annotated_text, fallback_html);
		} else if (session.selection?.type === 'node') {
			const selected_nodes = session.get_selected_nodes();
			const { nodes, main_nodes } = prepare_copy_payload(selected_nodes);

			const json_data = { nodes, main_nodes };

			console.log('Node copy:', {
				selected_nodes,
				nodes,
				total_nodes: Object.keys(nodes).length,
				operation: delete_selection ? 'cut' : 'copy'
			});

			// Generate fallback HTML for cross-app compatibility
			const selected_node_objects = main_nodes.map((id) => nodes[id]);
			const fallback_html = export_html(selected_node_objects);

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
			console.log('Property copy:', json_data);
			html = create_svedit_html_format(json_data, `<span>${value}</span>`);
			plain_text = String(value);
		}

		// Write to clipboard using event.clipboardData
		try {
			event.clipboardData?.setData('text/plain', plain_text || '');
			event.clipboardData?.setData('text/html', html || '');
			console.log('Data copied to clipboard successfully');
		} catch (err) {
			console.error('Failed to copy data: ', err);
		}

		if (delete_selection) {
			session.apply(session.tr.delete_selection());
		}
	}

	function oncut(event) {
		oncopy(event, true);
	}

	/**
	 * Attempts to paste JSON data as a node at the current selection.
	 *
	 * @param {string|object} pasted_json - The JSON data to paste, either as a string or parsed object
	 * @param {Selection} [selection] - Optional selection (node cursor) where the payload should be pasted
	 * @returns {boolean} True if the paste operation was successful, false otherwise
	 */
	function try_node_paste(pasted_json, selection) {
		const { nodes, main_nodes } = pasted_json;

		// NOTE: At this point, nodes contains a subgraph from the copy
		// with original ids.
		let tr = session.tr;
		if (selection) {
			tr.set_selection(selection);
		}

		// We can safely assume we're dealing with a node_array property
		const property_definition = session.inspect(tr.selection.path);
		const first_compatible_text_node_type = property_definition.node_types.find(
			(type) => session.kind({ type }) === 'text'
		);

		const nodes_to_insert = [];
		let rejected = false;
		for (const node_id of main_nodes) {
			const node = nodes[node_id];
			if (!property_definition.node_types.includes(node.type)) {
				// Incompatible node type detected
				if (session.kind(node) === 'text' && first_compatible_text_node_type) {
					const new_node_id = tr.build('the_node', {
						the_node: {
							id: 'the_node',
							type: first_compatible_text_node_type,
							content: node.content
						}
					});
					nodes_to_insert.push(new_node_id);
				} else {
					console.log(
						`rejected ${node.type}. Only ${property_definition.node_types.join(', ')} allowed.`
					);
					rejected = true;
					break;
				}
			} else {
				const new_node_id = tr.build(node_id, nodes);
				nodes_to_insert.push(new_node_id);
			}
		}

		if (!rejected) {
			tr.insert_nodes(nodes_to_insert);
			session.apply(tr);
			return true;
		} else {
			if (tr.selection.path.length >= 2) {
				const next_node_insert_cursor = session.get_next_node_insert_cursor(tr.selection);
				if (next_node_insert_cursor) {
					try_node_paste(pasted_json, next_node_insert_cursor);
				}
			}
		}
		return false;
	}

	async function onpaste(event) {
		// Only handle paste events if focus is within the canvas
		if (!canvas_el?.contains(document.activeElement)) return;
		event.preventDefault();

		let plain_text,
			pasted_json,
			pasted_images = [];

		// NOTE: For some reason, await navigator.clipboard.read()
		const clipboard_items = event.clipboardData?.items || [];
		for (const item of clipboard_items || []) {
			if (item.type.startsWith('image/')) {
				const blob = item.getAsFile();
				const data_url = URL.createObjectURL(blob);
				pasted_images.push({
					blob,
					data_url,
					type: item.type,
					size: blob.size
				});
			}
		}

		if (pasted_images.length > 0) {
			pasted_json = await session.config.handle_image_paste(session, pasted_images);
			console.log('pasted_json_after_image_paste', pasted_json);
			// NOTE: If no pasted_json is returned from the custom handler, we assume that content creation has been
			// handled inside handle_image_paste already.
			if (!pasted_json) return;
		} else {
			// First try to extract svedit data from HTML format
			try {
				const html_content = event.clipboardData?.getData('text/html');
				if (html_content) {
					pasted_json = extract_svedit_data_from_html(html_content);
				}
			} catch (e) {
				console.log('No HTML format available or failed to extract svedit data:', e);
				pasted_json = undefined;
			}

			try {
				plain_text = event.clipboardData?.getData('text/plain');
			} catch (e) {
				console.error('Failed to paste any content:', e);
			}

			// Try to contruct a node payload from plain text when applicable
			if (!pasted_json && typeof plain_text === 'string') {
				const plain_text_fragments = plain_text
					.split('\n\n')
					.map((fragment) => fragment.trim())
					.filter(Boolean);
				if (plain_text_fragments.length > 1) {
					pasted_json = {
						main_nodes: [],
						nodes: []
					};
					for (let i = 0; i < plain_text_fragments.length; i++) {
						const fragment = plain_text_fragments[i];
						pasted_json.nodes['fragment_' + i] = {
							id: 'fragment_' + i,
							type: 'text',
							content: {
								text: fragment,
								annotations: []
							}
						};
						pasted_json.main_nodes.push('fragment_' + i);
					}
				}
			}
		}

		console.log('plain_text', plain_text);
		console.log('pasted_json', pasted_json);

		if (pasted_json?.main_nodes && session.selection?.type === 'node') {
			// Paste nodes at a node selection
			try_node_paste(pasted_json);
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
		} else if (session.selection?.type === 'text' && pasted_json?.text) {
			// Paste text at a text selection
			session.apply(
				session.tr.insert_text(pasted_json.text, pasted_json.annotations, pasted_json.nodes)
			);
		} else if (
			session.selection?.type === 'text' &&
			pasted_json?.main_nodes?.length === 1 &&
			session.kind(pasted_json?.nodes[pasted_json.main_nodes[0]]) === 'text'
		) {
			// Paste a single text node, at a text cursor
			const text_property = pasted_json.nodes[pasted_json.main_nodes[0]].content;
			session.apply(
				session.tr.insert_text(text_property.text, text_property.annotations, pasted_json.nodes)
			);
		} else if (['text', 'property'].includes(session.selection?.type) && pasted_json?.nodes) {
			// Paste nodes at a text or property selection by finding the next valid insert cursor
			const next_node_insert_cursor = session.get_next_node_insert_cursor(session.selection);
			try_node_paste(pasted_json, next_node_insert_cursor);
		} else if (typeof plain_text === 'string') {
			// External paste: Fallback to plain text when no svedit data is found
			session.apply(session.tr.insert_text(plain_text.trim()));
		} else {
			console.log('Could not paste.');
		}
	}

	function render_selection() {
		const selection = /** @type {Selection} */ (session.selection);
		let prev_selection =
			__get_property_selection_from_dom() ||
			__get_text_selection_from_dom() ||
			__get_node_selection_from_dom();

		if (!selection) {
			// No model selection -> just leave things as they are'
			let dom_selection = window.getSelection();
			dom_selection.removeAllRanges();
			return;
		}

		// NOTE: Skip rerender only when the selection is the same and the focus is already within the canvas
		if (
			JSON.stringify(selection) === JSON.stringify(prev_selection) &&
			canvas_el?.contains(document.activeElement)
		) {
			// Skip. No need to rerender.
			return;
		}

		if (selection?.type === 'text') {
			__render_text_selection();
		} else if (selection?.type === 'node') {
			__render_node_selection();
		} else if (selection?.type === 'property') {
			__render_property_selection();
		} else {
			console.log('unsupported selection', $state.snapshot(selection));
		}
	}

	function focus_canvas() {
		// We just render the selection (which will return focus to the canvas) implicitly
		render_selection();
	}

	/**
	 * Extracts a NodeSelection from the current DOM selection.
	 *
	 *
	 * @returns {NodeSelection | null} A NodeSelection object if the DOM selection
	 *   represents a valid node selection, null otherwise
	 */
	function __get_node_selection_from_dom() {
		const dom_selection = window.getSelection();
		if (dom_selection.rangeCount === 0) return null;

		let focus_node = /** @type {HTMLElement} */ (dom_selection.focusNode);
		let anchor_node = /** @type {HTMLElement} */ (dom_selection.anchorNode);

		// If focus_node or anchor_node not an element node (e.g. a text node), we need
		// to use the parent element, so we can perform the closest() query on it.
		if (focus_node.nodeType !== Node.ELEMENT_NODE) focus_node = focus_node.parentElement;
		if (anchor_node.nodeType !== Node.ELEMENT_NODE) anchor_node = anchor_node.parentElement;

		// EDGE CASE: Let's first check if we are in a cursor trap for node cursors
		let after_node_cursor_trap =
			focus_node && focus_node?.closest('[data-type="after-node-cursor-trap"]');
		if (after_node_cursor_trap && focus_node === anchor_node) {
			// Find the node that this cursor trap belongs to
			let node = /** @type {HTMLElement} */ (after_node_cursor_trap.closest('[data-type="node"]'));
			if (!node) {
				console.log('No corresponding node found for after-node-cursor-trap');
				return null;
			}
			const node_path = /** @type {DocumentPath} */ (node.dataset.path.split('.'));
			const node_index = parseInt(String(node_path.at(-1)), 10);

			return {
				type: 'node',
				path: node_path.slice(0, -1),
				anchor_offset: node_index + 1,
				focus_offset: node_index + 1
			};
		}

		// EDGE CASE: Let's check if we are in a position-zero-cursor-trap for node_arrays.
		let position_zero_cursor_trap = focus_node.closest('[data-type="position-zero-cursor-trap"]');
		if (position_zero_cursor_trap && focus_node === anchor_node) {
			const node_array_el = /** @type {HTMLElement} */ (
				position_zero_cursor_trap.closest('[data-type="node_array"]')
			);
			const node_array_path = node_array_el.dataset.path.split('.');
			return {
				type: 'node',
				path: node_array_path,
				anchor_offset: 0,
				focus_offset: 0
			};
		}

		let focus_root = /** @type {HTMLElement} */ (
			focus_node.closest('[data-path][data-type="node"]')
		);
		if (!focus_root) return null;

		let anchor_root = /** @type {HTMLElement} */ (
			anchor_node.closest('[data-path][data-type="node"]')
		);
		if (!anchor_root) return null;

		if (!(focus_root && anchor_root)) {
			return null;
		}

		let focus_root_path = focus_root.dataset.path.split('.');
		let anchor_root_path = anchor_root.dataset.path.split('.');
		let focus_node_depth = focus_root_path.length;
		let anchor_node_depth = anchor_root_path.length;

		// HACK: this works only for one level nesting - should be done recursively to work generally
		if (focus_root_path.length > anchor_root_path.length) {
			focus_root = focus_root.parentElement.closest('[data-path][data-type="node"]');
			if (!focus_root) return null;
			focus_root_path = focus_root.dataset.path.split('.');
		} else if (anchor_root_path.length > focus_root_path.length) {
			anchor_root = anchor_root.parentElement.closest('[data-path][data-type="node"]');
			if (!anchor_root) return null;
			anchor_root_path = anchor_root.dataset.path.split('.');
		}

		const is_same_node_array =
			focus_root_path.slice(0, -1).join('.') === anchor_root_path.slice(0, -1).join('.');
		if (!is_same_node_array) {
			console.log('invalid selection, not same node_array');
			return null;
		}

		let anchor_offset = parseInt(anchor_root_path.at(-1));
		let focus_offset = parseInt(focus_root_path.at(-1));

		// Check if it's a backwards selection
		const is_backwards = __is_dom_selection_backwards();
		if (is_backwards) {
			anchor_offset += 1;
		} else {
			focus_offset += 1;
		}

		// EDGE CASE: Exclude first node when anchor_node is an afer-node-cursor-trap
		// in a non-collapsed forward selection
		if (
			anchor_node.parentElement?.dataset.type === 'after-node-cursor-trap' &&
			!is_backwards &&
			anchor_offset !== focus_offset
		) {
			anchor_offset += 1;
		}
		// EDGE CASE: Exclude first node when focus_node is an afer-node-cursor-trap
		// in a non-collapsed backward selection
		else if (
			focus_node.parentElement?.dataset.type === 'after-node-cursor-trap' &&
			is_backwards &&
			anchor_offset !== focus_offset &&
			// EDGE CASE: Only do correction when drag started from a deeper or equally deep anchor node
			anchor_node_depth >= focus_node_depth
		) {
			focus_offset += 1;
		}

		return {
			type: 'node',
			path: anchor_root_path.slice(0, -1),
			anchor_offset: anchor_offset,
			focus_offset: focus_offset
		};
	}

	/**
	 * Extracts a PropertySelection from the current DOM selection.
	 *
	 *
	 * @returns {PropertySelection | null} A PropertySelection object if the DOM selection
	 *   represents a valid property selection, null otherwise
	 */
	function __get_property_selection_from_dom() {
		const dom_selection = window.getSelection();
		if (dom_selection.rangeCount === 0) return null;

		let focus_root = /** @type {HTMLElement} */ (
			dom_selection.focusNode.parentElement?.closest('[data-path][data-type="property"]')
		);
		if (!focus_root) return null;
		let anchor_root = /** @type {HTMLElement} */ (
			dom_selection.anchorNode.parentElement?.closest('[data-path][data-type="property"]')
		);
		if (!anchor_root) return null;

		if (focus_root === anchor_root) {
			return {
				type: 'property',
				path: focus_root.dataset.path.split('.')
			};
		}
		return null;
	}

	function __get_selection_from_dom() {
		return (
			__get_property_selection_from_dom() ||
			__get_text_selection_from_dom() ||
			__get_node_selection_from_dom()
		);
	}

	/**
	 * Extracts a TextSelection from the current DOM selection.
	 *
	 *
	 * @returns {TextSelection | null} A TextSelection object if the DOM selection
	 *   represents a valid text selection, null otherwise
	 */
	function __get_text_selection_from_dom(range = null) {
		let dom_selection;
		let focus_node, anchor_node;
		let focus_offset_in_node; // anchor_offset_in_node;

		if (range) {
			// When range is provided, use it directly
			focus_node = range.endContainer;
			anchor_node = range.startContainer;
			focus_offset_in_node = range.endOffset;
			// anchor_offset_in_node = range.startOffset;
		} else {
			// Otherwise get from window selection
			dom_selection = window.getSelection();
			if (dom_selection.rangeCount === 0) return null;
			focus_node = dom_selection.focusNode;
			anchor_node = dom_selection.anchorNode;
			focus_offset_in_node = dom_selection.focusOffset;
			// anchor_offset_in_node = dom_selection.anchorOffset;
			range = dom_selection.getRangeAt(0);
		}

		let focus_root, anchor_root;

		if (focus_node === anchor_node && focus_node.dataset?.type === 'text') {
			// EDGE CASE 1: Either text node is empty (only a <br> is present), or cursor is after a <br> at the very end of the text node
			focus_root = anchor_root = focus_node;
		} else {
			focus_root = /** @type {HTMLElement} */ (
				focus_node.parentElement?.closest('[data-path][data-type="text"]')
			);
			if (!focus_root) return null;
			anchor_root = /** @type {HTMLElement} */ (
				anchor_node.parentElement?.closest('[data-path][data-type="text"]')
			);
			if (!anchor_root) return null;
		}

		if (focus_root !== anchor_root) {
			return null;
		}

		const path = focus_root.dataset.path.split('.');

		if (!path) return null;

		// EDGE CASE 1B: Cursor after trailing <br> at end of text
		const text_content = session.get(path).text;
		const text_length = get_char_length(text_content);
		if (text_length > 0) {
			const last_char = get_char_at(text_content, text_length - 1);
			if (
				focus_node === anchor_node &&
				focus_node === focus_root &&
				focus_root.dataset?.type === 'text' &&
				!focus_root.classList.contains('empty') &&
				last_char === '\n'
			) {
				const child_nodes = focus_root.childNodes;

				if (
					child_nodes.length > 0 &&
					child_nodes[child_nodes.length - 1].nodeName === 'BR' &&
					focus_offset_in_node >= child_nodes.length - 2
				) {
					return {
						type: 'text',
						path,
						anchor_offset: text_length,
						focus_offset: text_length
					};
				}
			}
		}

		let start_offset = 0;
		let end_offset = 0;
		let current_offset = 0;

		function processNode(node) {
			if (node.nodeType === Node.TEXT_NODE) {
				const nodeText = node.textContent;
				const nodeCharLength = get_char_length(nodeText);
				if (node === range.startContainer) {
					// Convert UTF-16 offset to character offset
					const char_start_offset = utf16_to_char_offset(nodeText, range.startOffset);
					start_offset = current_offset + char_start_offset;
				}
				if (node === range.endContainer) {
					// Convert UTF-16 offset to character offset
					const char_end_offset = utf16_to_char_offset(nodeText, range.endOffset);
					end_offset = current_offset + char_end_offset;
				}
				current_offset += nodeCharLength;
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				for (const childNode of node.childNodes) {
					processNode(childNode);
				}
			}
			return end_offset !== 0;
		}

		// Process nodes to find offsets
		for (const childNode of focus_root.childNodes) {
			if (processNode(childNode)) break;
		}

		// Check if it's a backward selection
		// When range is provided, we can't detect backward selection from the range alone
		// since ranges are always normalized (start before end)
		const is_backward = dom_selection ? __is_dom_selection_backwards() : false;

		// Assign to anchor/focus based on direction
		const anchor_offset = is_backward ? end_offset : start_offset;
		const focus_offset = is_backward ? start_offset : end_offset;

		return {
			type: 'text',
			path,
			anchor_offset,
			focus_offset
		};
	}

	function __get_node_element(node_array_path, node_offset) {
		const node_array_el = canvas_el.querySelector(
			`[data-path="${node_array_path}"][data-type="node_array"]`
		);
		if (!node_array_el) return null;

		const node_elements = node_array_el.children;
		if (node_elements.length === 0) return null;

		return node_elements[node_offset];
	}

	function __render_node_selection() {
		const selection = /** @type {NodeSelection} */ (session.selection);
		const node_array_path = selection.path.join('.');
		let is_collapsed = selection.anchor_offset === selection.focus_offset;
		let is_backward = !is_collapsed && selection.anchor_offset > selection.focus_offset;

		// We need to translate the cusor offset to node offsets now
		let anchor_node_offset, focus_node_offset;

		if (is_collapsed) {
			anchor_node_offset = Math.max(0, selection.anchor_offset - 1);
			focus_node_offset = Math.max(0, selection.focus_offset - 1);
		} else if (is_backward) {
			anchor_node_offset = selection.anchor_offset - 1;
			focus_node_offset = selection.focus_offset;
		} else {
			anchor_node_offset = selection.anchor_offset;
			focus_node_offset = selection.focus_offset - 1;
		}

		const anchor_node = __get_node_element(node_array_path, anchor_node_offset);
		const focus_node = __get_node_element(node_array_path, focus_node_offset);

		if (!anchor_node || !focus_node) return;
		const dom_selection = window.getSelection();
		const range = window.document.createRange();

		if (is_collapsed) {
			// Cursor position in between two nodes or at the very beginning/end of a node_array
			// IMPORTANT: We need to look for direct children of anchor_node to find the right cursor trap.
			const cursor_trap_el = anchor_node.querySelector(
				selection.anchor_offset === 0
					? ':scope > .position-zero-cursor-trap'
					: ':scope > .after-node-cursor-trap'
			);

			range.setStart(cursor_trap_el, 1);
			range.setEnd(cursor_trap_el, 1);
			dom_selection.removeAllRanges();
			dom_selection.addRange(range);
		} else {
			// Expanded selection (one or more nodes are fully selectd)
			if (is_backward) {
				// Use the last selectable you find
				const anchor_node_selectable = [...anchor_node.querySelectorAll('.svedit-selectable')].at(
					-1
				);
				// Use the first selectable you find
				const focus_node_selectable = [...focus_node.querySelectorAll('.svedit-selectable')].at(0);

				range.setStart(focus_node_selectable, 1);
				range.setEnd(anchor_node_selectable, 1);
				dom_selection.removeAllRanges();
				dom_selection.addRange(range);
				// Phew, this was a hard nut to crack. But with that code the direction can be reversed.
				dom_selection.setBaseAndExtent(anchor_node_selectable, 1, focus_node_selectable, 1);
			} else {
				// Use the first selectable you find
				const anchor_node_selectable = [...anchor_node.querySelectorAll('.svedit-selectable')].at(
					0
				);
				// Use the last selectable you find
				const focus_node_selectable = [...focus_node.querySelectorAll('.svedit-selectable')].at(-1);

				range.setStart(anchor_node_selectable, 1);
				range.setEnd(focus_node_selectable, 1);
				dom_selection.removeAllRanges();
				dom_selection.addRange(range);
			}
		}

		// Ensure the node_array is focused
		const node_array_el = canvas_el.querySelector(
			`[data-path="${node_array_path}"][data-type="node_array"]`
		);
		if (node_array_el) {
			node_array_el.focus();
			// Scroll the selection into view
			setTimeout(() => {
				(is_backward ? focus_node : anchor_node).scrollIntoView({
					block: 'nearest',
					inline: 'nearest'
				});
			}, 0);
		} else {
			console.log('No container element found!');
		}
	}

	function __render_property_selection() {
		const selection = session.selection;
		// The element that holds the property
		const el = canvas_el.querySelector(
			`[data-path="${selection.path.join('.')}"][data-type="property"]`
		);
		const cursor_trap_selectable = el.querySelector('.svedit-selectable');
		const range = window.document.createRange();
		const dom_selection = window.getSelection();

		// Select the entire cursor trap element contents and collapse to start
		range.selectNodeContents(cursor_trap_selectable);
		range.collapse(true); // Collapse to start position
		dom_selection.removeAllRanges();
		dom_selection.addRange(range);

		// Scroll the selection into view
		setTimeout(() => {
			const selectedElement = dom_selection.focusNode.parentElement;
			if (selectedElement) {
				selectedElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			}
		}, 0);
	}

	function __render_text_selection() {
		const selection = /** @type {any} */ (session.selection);
		// The element that holds the annotated string
		const el = canvas_el.querySelector(
			`[data-path="${selection.path.join('.')}"][data-type="text"]`
		);
		const empty_text = session.get(selection.path).text.length === 0;
		const dom_selection = window.getSelection();
		let current_offset = 0;
		/** @type {HTMLElement | Text} */
		let anchor_node;
		/** @type {HTMLElement | Text} */
		let focus_node;
		/** @type {number} */
		let anchor_node_offset;
		/** @type {number} */
		let focus_node_offset;
		const is_backward = selection.anchor_offset > selection.focus_offset;
		const start_offset = Math.min(selection.anchor_offset, selection.focus_offset);
		const end_offset = Math.max(selection.anchor_offset, selection.focus_offset);

		// Helper function to process each node
		function process_node(node) {
			if (node.nodeType === Node.TEXT_NODE) {
				const node_text = node.textContent;
				const node_char_length = get_char_length(node_text);

				if (is_backward) {
					if (!focus_node && current_offset + node_char_length >= start_offset) {
						focus_node = node;
						const char_offset = start_offset - current_offset;
						focus_node_offset = char_to_utf16_offset(node_text, char_offset);
					}
				} else {
					if (!anchor_node && current_offset + node_char_length >= start_offset) {
						anchor_node = node;
						const char_offset = start_offset - current_offset;
						anchor_node_offset = char_to_utf16_offset(node_text, char_offset);
					}
				}

				// Find end node
				if (is_backward) {
					if (!anchor_node && current_offset + node_char_length >= end_offset) {
						anchor_node = node;
						const char_offset = end_offset - current_offset;
						anchor_node_offset = char_to_utf16_offset(node_text, char_offset);
						return true; // Stop iteration
					}
				} else {
					if (!focus_node && current_offset + node_char_length >= end_offset) {
						focus_node = node;
						const char_offset = end_offset - current_offset;
						focus_node_offset = char_to_utf16_offset(node_text, char_offset);
						return true; // Stop iteration
					}
				}
				current_offset += node_char_length;
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				for (const child_node of node.childNodes) {
					if (process_node(child_node)) return true; // Stop iteration if end found
				}
			}
			return false; // Continue iteration
		}

		// EDGE CASE: When text is empty, we need to set a different DOM selection
		if (start_offset === end_offset && start_offset === 0 && empty_text) {
			// Markup for empty text looks like this `<div data-type="text"><br></div>`.
			// And the correct cursor position is after the <br> element.
			anchor_node = el;
			anchor_node_offset = 1;
			focus_node = el;
			focus_node_offset = 1;
		} else {
			// DEFAULT CASE
			for (const child_node of el.childNodes) {
				if (process_node(child_node)) break;
			}
		}

		// Set the range if both start and end were found
		if (anchor_node && focus_node) {
			dom_selection.removeAllRanges();
			// NOTE: Only using setBaseAndExtent() will preserve selection direction
			dom_selection.setBaseAndExtent(
				anchor_node,
				anchor_node_offset,
				focus_node,
				focus_node_offset
			);
			el.focus(); // needed?

			// Scroll the selection into view
			setTimeout(() => {
				const selectedElement = dom_selection.focusNode.parentElement;
				if (selectedElement) {
					selectedElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
				}
			}, 0);
		}
	}

	// Utils
	// --------------------------

	function __is_dom_selection_backwards() {
		const dom_selection = window.getSelection();

		// If there's no dom_selection, return false
		if (dom_selection.rangeCount === 0) return false;

		// Get the range of the dom_selection
		const range = dom_selection.getRangeAt(0);

		if (range.collapsed) return false;

		// Create a new range for comparison
		const comparisonRange = range.cloneRange();

		// Set the comparison range to start at the dom_selection's anchor and end at its focus
		comparisonRange.setStart(dom_selection.anchorNode, dom_selection.anchorOffset);
		comparisonRange.setEnd(dom_selection.focusNode, dom_selection.focusOffset);

		// If the comparison range is collapsed, the selection is backwards
		return comparisonRange.collapsed;
	}

	// Whenever the model selection changes, render the selection
	$effect(() => {
		render_selection();
	});
</script>

<!--
  TODO: We must get rid of the global handlers here, so Svedit doesn't conflict
  with any app-specific event handling.
-->
<svelte:document {onselectionchange} {oncut} {oncopy} {onpaste} />

<!-- TODO: move oncut/copy/paste handlers inside .svedit -->
<div class="svedit">
	<div
		class="svedit-canvas {css_class}"
		class:hide-selection={session.selection?.type === 'node'}
		class:node-cursor={session.selection?.type === 'node' &&
			session.selection.anchor_offset === session.selection.focus_offset}
		class:property-selection={session.selection?.type === 'property'}
		bind:this={canvas_el}
		{onbeforeinput}
		{oncompositionstart}
		{oncompositionend}
		onfocus={handle_canvas_focus}
		onblur={handle_canvas_blur}
		contenteditable={editable ? 'true' : 'false'}
		{autocapitalize}
		{spellcheck}
		{...{
			// NOTE: Autocomplete and autocorrect make immense troubles
			// on Desktop Chrome, so we disable them only for Chrome desktop.
			// Additionally, OSX-native auto-complete also breaks, because
			// I'm using a keyed block that always wipes the DOM of a text node
			// on every change.
			// autocomplete: is_chrome_desktop ? "off" : "on",
			// autocorrect: is_chrome_desktop ? "off" : "on"
		}}
	>
		<RootComponent {path} />
	</div>
	<Overlays />
</div>

<style>
	.svedit-canvas {
		--layout-orientation: vertical;
		caret-color: var(--editing-stroke-color);
		caret-shape: block;
		&:focus {
			outline: none;
		}
	}

	.svedit-canvas :global(::selection) {
		background: var(--editing-fill-color);
	}

	@media not (pointer: coarse) {
		.svedit-canvas.hide-selection {
			caret-color: transparent;
		}
	}

	/* When the cursor is in a cursor-trap we never want to see the caret */
	.svedit-canvas.node-cursor,
	.svedit-canvas.property-selection {
		caret-color: transparent;
	}

	@media not (pointer: coarse) {
		@supports (anchor-name: --test) {
			.svedit-canvas.hide-selection :global(::selection) {
				background: transparent;
			}
		}
	}
</style>
