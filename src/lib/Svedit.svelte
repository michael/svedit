<script lang="ts" generics="S extends DocumentSchema">
	import { flushSync, getContext, setContext } from 'svelte';
	import {
		get_char_length,
		char_to_utf16_offset,
		deserialize_path,
		paths_equal,
		serialize_path,
		is_selection_collapsed
	} from './utils.js';
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
	import { create_node_visibility } from './node_visibility.svelte.js';
	import DefaultNodeSelectionMarkers from './NodeSelectionMarkers.svelte';
	import './styles/svedit-colors.css';
	import './styles/svedit-animations.css';

	import type {
		DocumentSchema,
		SveditProps,
		Selection,
		NodeSelection,
		TextSelection,
		PropertySelection,
		DocumentNode,
		DocumentPath,
		DynamicRecord,
		NodeHtmlExporter
	} from './types.js';
	import type { KeyMapper } from './KeyMapper.svelte.js';
	import type Session from './Session.svelte.js';

	let {
		session,
		editable = $bindable(false),
		path,
		class: css_class,
		autocapitalize = 'on',
		spellcheck = 'true'
	}: SveditProps<S> = $props();

	let canvas_el: HTMLElement | undefined;
	let root_node = $derived(session.get(path));
	let Overlays = $derived(session.config.system_components?.overlays);
	let NodeSelectionMarkers = $derived(
		session.config.system_components?.node_selection_markers ?? DefaultNodeSelectionMarkers
	);
	let RootComponent = $derived(session.config.node_components[root_node.type]);

	let is_composing = $state(false);
	let canvas_focused = $state(false);
	let before_composition_selection: TextSelection | null = null;
	// Set by onselectionchange before it commits a DOM-derived selection
	// to the model. render_selection consumes-and-clears it to skip
	// rerender on DOM-driven changes (the DOM is already in place).
	let selection_source_is_dom = false;

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
		get canvas_focused() {
			return canvas_focused;
		},
		focus_canvas
	};

	setContext('svedit', context);
	create_node_visibility(context);

	$effect(() => {
		check_duplicate_paths();
	});

	function check_duplicate_paths() {
		if (!canvas_el) return;

		const mounted_paths: Record<string, true> = Object.create(null);

		for (const element of canvas_el.querySelectorAll('[data-path]')) {
			if (element.closest('.svedit-canvas') !== canvas_el) continue;

			const path_str = element.getAttribute('data-path');
			if (!path_str) continue;

			if (mounted_paths[path_str]) {
				console.warn(
					`[svedit] Path "${path_str}" is mounted more than once. Within a single Svedit document, each path may be mounted exactly once. To render shared content in multiple places (e.g. header + footer nav), use distinct node_arrays or separate Svedit instances.`
				);
			}

			mounted_paths[path_str] = true;
		}
	}

	// Get KeyMapper from context (may be undefined if not provided)
	const key_mapper = getContext<KeyMapper>('key_mapper');

	// Initialize commands and keymap on the session
	$effect(() => {
		session.initialize_commands(context);
	});

	// Learn the software keyboard's size once it has been observed, so the
	// tap preempt can predict the post-keyboard visible band before the
	// keyboard opens, and the toolbar glide (__publish_keyboard_inset) can
	// move to the right place instead of a guess. Overwritten on every
	// observation, so rotation or keyboard changes self-correct at the
	// next opening.
	let observed_keyboard_inset = 0;

	// The tap preempt and the published inset work around iOS-specific
	// behavior: iOS neither resizes the layout viewport for its keyboard
	// nor reveals carets into nested scroll containers. Other platforms
	// (Android Chrome resizes the layout viewport and reveals natively)
	// must be left alone, so — like every editor library — the workaround
	// is gated on the platform it works around. iPadOS masquerades as
	// macOS, hence the touch-point check.
	const is_ios =
		typeof navigator !== 'undefined' &&
		(/iP(hone|ad|od)/.test(navigator.userAgent) ||
			(navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1));

	// Published keyboard geometry: the single visualViewport listener below
	// maintains --svedit-keyboard-inset on the root element, so app UI
	// (e.g. a bottom toolbar) can pin itself above the software keyboard
	// with pure CSS — margin-bottom: var(--svedit-keyboard-inset, 0px) —
	// instead of running listeners of its own. Because the OS reports
	// keyboard geometry late (often one event at animation end), the value
	// is also updated PREDICTIVELY on canvas focus/blur; a CSS transition
	// on the consumer glides over the remaining error.
	function __publish_keyboard_inset(value: number) {
		window.document.documentElement.style.setProperty(
			'--svedit-keyboard-inset',
			`${Math.max(0, Math.round(value))}px`
		);
	}

	$effect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const measure = () => {
			const inset = Math.round(window.innerHeight - vv.height - vv.offsetTop);
			// Only learn at 1:1 zoom — pinch zoom also shrinks the visual
			// viewport and would teach a bogus keyboard size.
			if (vv.scale === 1 && inset > 150) observed_keyboard_inset = inset;
			// Real measurement corrects the predictive focus/blur values.
			// Non-iOS platforms resize the layout viewport for the keyboard
			// themselves — the toolbar needs no offset there.
			if (vv.scale === 1) __publish_keyboard_inset(is_ios ? inset : 0);
		};
		measure();
		vv.addEventListener('resize', measure);
		// The inset formula includes offsetTop, which visual-viewport pans
		// (pinch zoom) change without a resize.
		vv.addEventListener('scroll', measure);
		return () => {
			vv.removeEventListener('resize', measure);
			vv.removeEventListener('scroll', measure);
			window.document.documentElement.style.removeProperty('--svedit-keyboard-inset');
		};
	});

	// Tap cursor safeguarding on touch, for app-shell layouts (nested
	// scroller, unscrollable document). There, iOS neither scrolls the
	// document nor reveals carets into nested scroll containers — nobody
	// scrolls, so a tap in the keyboard's future territory would leave the
	// caret hidden. Timing is everything:
	// - later (debounced, mid-presentation) kills the keyboard;
	// - at click time it corrupts the tap — iOS commits the caret AFTER
	//   click, re-hit-testing the stored tap point against the shifted
	//   layout, which can land on a node (inputmode none, no keyboard);
	// - HERE, synchronously at the selectionchange that commits the
	//   DOM-driven caret, the caret is anchored to its text and the
	//   presentation has barely begun. Scroll the container so the caret
	//   line ends up just above the predicted keyboard + floating-UI band
	//   (scroll-padding). One owned movement, no corrections, and carets
	//   that stay visible move nothing.
	function __preempt_keyboard_occlusion() {
		if (!editable || !is_ios) return;
		const vv = window.visualViewport;
		const inset_now = vv ? Math.round(window.innerHeight - vv.height - vv.offsetTop) : 0;
		// With the keyboard already up, taps land on visible text, and
		// caret drags must never be fought — only act before it exists.
		if (inset_now > 150) return;
		// While pinch-zoomed the client-rect and visual-viewport coordinate
		// spaces disagree — stand down, like the learning does.
		if (vv && vv.scale !== 1) return;
		// App-shell layouts only: a scrollable DOCUMENT means the OS owns
		// the caret reveal (embedded contexts, plain pages) — acting there
		// would double-scroll against it. Same for the absence of a nested
		// vertical scroller.
		const doc_el = window.document.scrollingElement ?? window.document.documentElement;
		if (doc_el.scrollHeight - doc_el.clientHeight > 1) return;
		const container = __get_scroll_container(canvas_el ?? null);
		if (!container) return;
		// Inside iframes the visual viewport never reflects the keyboard —
		// without a learned size, any prediction would be fiction.
		if (window !== window.top && !observed_keyboard_inset) return;
		const dom_selection = window.getSelection();
		if (!dom_selection?.rangeCount || !dom_selection.focusNode) return;
		const caret_rect = __get_caret_rect(dom_selection.focusNode, dom_selection.focusOffset);
		if (!caret_rect) return;
		// The visible band is the one reveal-band definition, additionally
		// clamped by the predicted keyboard: its size is learned once
		// observed; before the first opening assume half the screen. The
		// learned value is clamped to 60% of the current height so a stale
		// cross-orientation value (portrait keyboard used in landscape)
		// degrades to roughly the fallback instead of collapsing the band.
		const predicted_inset =
			Math.min(observed_keyboard_inset, Math.round(window.innerHeight * 0.6)) ||
			Math.round(window.innerHeight * 0.5);
		const bounds = __get_reveal_bounds(container, predicted_inset);
		if (bounds.max_y - bounds.min_y < 2 * caret_rect.height) return;
		// Half a line of headroom so the caret line clears the band fully.
		if (caret_rect.bottom + 8 <= bounds.max_y) return;
		// Land in the CENTER of the predicted visible band, not at its
		// edge: iOS nudges the scroller back by up to ~300px during its
		// transient keyboard reflows, and an edge-parked caret slides
		// straight under the toolbar. Center placement absorbs the nudge.
		const target_y = (bounds.min_y + bounds.max_y) / 2;
		container.scrollTop += Math.round(caret_rect.top + caret_rect.height / 2 - target_y);
		// iOS may stomp the scroller right after: its own reveal runs
		// against transient viewport geometry (panned visual viewport,
		// briefly shrunken innerHeight) that snaps back a moment later,
		// leaving the caret behind the keyboard. Our position is computed
		// against the settled geometry, so hold it through the
		// presentation window — re-assert on any foreign scroll, but yield
		// immediately to real user input.
		const target_scroll_top = container.scrollTop;
		const guard = () => {
			if (Math.abs(container.scrollTop - target_scroll_top) > 1) {
				container.scrollTop = target_scroll_top;
			}
		};
		const stop_guard = () => {
			container.removeEventListener('scroll', guard);
			container.removeEventListener('touchstart', stop_guard);
			container.removeEventListener('wheel', stop_guard);
			container.removeEventListener('pointerdown', stop_guard);
		};
		container.addEventListener('scroll', guard);
		container.addEventListener('touchstart', stop_guard, { passive: true, once: true });
		container.addEventListener('wheel', stop_guard, { passive: true, once: true });
		container.addEventListener('pointerdown', stop_guard, { once: true });
		setTimeout(stop_guard, 800);
	}

	/**
	 * @param {InputEvent} event
	 */
	async function onbeforeinput(event: InputEvent) {
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
			session.apply(session.tr.toggle_mark('strong'));
			event.preventDefault();
			event.stopPropagation();
		}

		if (event.inputType === 'formatItalic' && session.selection?.type === 'text') {
			session.apply(session.tr.toggle_mark('emphasis'));
			event.preventDefault();
			event.stopPropagation();
		}

		// NOTE: underline doesn't make much sense as a semantic mark,
		// so we rewire `cmd + u` to toggle highlights
		if (event.inputType === 'formatUnderline' && session.selection?.type === 'text') {
			session.apply(session.tr.toggle_mark('highlight'));
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
	 */
	function oncompositionstart(/*event*/) {
		// console.log('DEBUG: oncompositionstart', event.data);
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
	function oncompositionend(event: CompositionEvent) {
		// console.log('DEBUG: oncompositionend, insert:', event.data, event);
		if (!canvas_el?.contains(document.activeElement)) return;
		if (session.selection?.type === 'text') {
			// We need to remember the user's selection, as it might have changed in the process
			// of finishing a composition. For instance, the user might have selected a different
			// part of the text while composing.
			const user_selection = __get_selection_from_dom();

			// HACK: In order to restore the DOM state from before composition, we just run contenteditable's
			// native undo command. Then the DOM will be in sync again with the editor's internal state.
			document.execCommand('undo', false, null);

			// Firefox may not undo native composition DOM. If the composed text is
			// still present, remove it manually before applying the Svedit transaction.
			__remove_native_composition_text(before_composition_selection, event.data);

			// Set the selection to where the user initiated the composition, make changes, and apply.
			// NOTE: We need to check for valid selection here, as there is a rare race condition
			// where the user had no text selection at the start of composition.
			if (before_composition_selection) {
				session.selection = before_composition_selection;
				// console.log('event.data', event.data);
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
		if (!canvas_focused) return;
		if (is_composing) return;
		const dom_selection = window.getSelection();
		if (!dom_selection.rangeCount) return;

		// Only handle selection changes if selection is within the canvas
		const range = dom_selection.getRangeAt(0);
		if (!canvas_el?.contains(range.commonAncestorContainer)) return;
		let selection = __get_selection_from_dom();
		if (selection) {
			// Avoid assigning a new object reference when the selection is
			// structurally identical — prevents a redundant $effect cycle
			// (render_selection → scrollIntoView) on every DOM layout change.
			if (JSON.stringify(selection) === JSON.stringify(session.selection)) return;
			selection_source_is_dom = true;
			session.selection = selection;
			if (selection.type === 'text' && selection.anchor_offset === selection.focus_offset) {
				// The keyboard is coming (or staying): publish the learned
				// inset predictively — the OS reports geometry only late in
				// its animation — so CSS consumers glide in sync. Then keep
				// the caret visible.
				if (is_ios && observed_keyboard_inset) {
					// Clamped like the preempt's prediction, so a stale
					// cross-orientation value can't glide the toolbar off
					// toward the top of a landscape screen.
					__publish_keyboard_inset(
						Math.min(observed_keyboard_inset, Math.round(window.innerHeight * 0.6))
					);
				}
				__preempt_keyboard_occlusion();
			} else if (selection.type !== 'text') {
				// Non-text selections mean no keyboard (inputmode none) —
				// retract any predicted inset so the toolbar never hovers
				// over a keyboard that isn't coming, and glides down when a
				// node tap closes an open one without blurring the canvas.
				__publish_keyboard_inset(0);
			}
		}
	}

	/**
	 * Creates HTML clipboard format with embedded svedit data
	 * @param {Object} json_data - The svedit data to embed
	 * @param {string} fallback_html - HTML for cross-app compatibility
	 * @returns {string} HTML with embedded svedit data
	 */
	function create_svedit_html_format(json_data: unknown, fallback_html: string): string {
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
	function extract_svedit_data_from_html(html: string): DynamicRecord | null {
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
	function default_node_html_exporter(
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
			if (property_definition.type === 'text') {
				const text_content = prop_value.content;
				if (text_content.trim()) {
					html += `<p>${text_content}</p>`;
				}
			} else if (property_definition.type === 'node_array') {
				for (const child_id of prop_value.nodes) {
					const child = session.get(child_id);
					const child_exporter = html_exporters[child.type] || default_node_html_exporter;
					html += child_exporter(child, session, html_exporters);
				}
			}
		}
		return html;
	}

	function default_node_plain_text_exporter(node: DocumentNode): string {
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
	 * @param {Object[]} nodes - Array of node objects
	 * @returns {string} HTML representation
	 */
	function export_html(nodes: DocumentNode[]): string {
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

	function export_plain_text(nodes: DocumentNode[]): string {
		let plain_text = '';

		for (const node of nodes) {
			plain_text += default_node_plain_text_exporter(node);
		}
		return plain_text.trim();
	}

	/**
	 * @param {ClipboardEvent} event
	 * @param {boolean} delete_selection - used by oncut()
	 */
	function oncopy(event: ClipboardEvent, delete_selection = false) {
		// Only handle copy events if editable and focus is within the canvas
		if (!editable) return;
		if (!canvas_el?.contains(document.activeElement)) return;

		event.preventDefault();
		event.stopPropagation();

		let plain_text, text, html;

		if (session.selection?.type === 'text') {
			plain_text = session.get_selected_plain_text();
			text = session.get_selected_text();
			const fallback_html = `<span>${text.content}</span>`;

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
			html = create_svedit_html_format(json_data, `<span>${value}</span>`);
			plain_text = String(value);
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

	function oncut(event: ClipboardEvent) {
		if (!editable) return;
		oncopy(event, true);
	}

	/**
	 * @returns {NodeSelection|null}
	 */
	function get_root_node_insert_caret() {
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
	 * @param {Selection|null} [selection]
	 * @returns {NodeSelection|null}
	 */
	function get_target_node_insert_caret(selection = session.selection) {
		if (selection?.type === 'node') {
			return selection;
		}

		const next_node_insert_caret = session.get_next_node_insert_caret(selection);
		if (next_node_insert_caret?.type === 'node') {
			return next_node_insert_caret;
		}

		return get_root_node_insert_caret();
	}

	/**
	 * @param {Selection|null} [selection]
	 * @returns {NodeSelection|null}
	 */
	function get_node_insert_caret_after_text_selection(selection = session.selection) {
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
	 * @param {string|object} pasted_json - The JSON data to paste, either as a string or parsed object
	 * @param {Selection} [selection] - Optional selection (node caret) where the payload should be pasted
	 * @returns {boolean} True if the paste operation was successful, false otherwise
	 */
	function try_node_paste(pasted_json: DynamicRecord | null, selection?: Selection): boolean {
		const { nodes, main_nodes, marks = [], annotations = [] } = pasted_json || {};
		if (!nodes || !main_nodes?.length) return false;

		let tr = session.tr;
		if (selection) {
			tr.set_selection(selection);
		}
		if (tr.selection?.type !== 'node') return false;

		const property_definition = session.inspect(tr.selection.path);
		if (property_definition?.type !== 'node_array') return false;

		const default_text_node_type = get_default_text_node(property_definition, session.schema);
		const target_text_property_name = get_text_property_name(
			default_text_node_type,
			session.schema
		);

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
					const new_node_id = tr.build('the_node', {
						the_node: {
							id: 'the_node',
							type: default_text_node_type,
							[target_text_property_name]: text_content || {
								content: '',
								marks: [],
								annotations: []
							}
						}
					});
					nodes_to_insert.push(new_node_id);
				} else {
					rejected = true;
					break;
				}
			} else {
				const new_node_id = tr.build(node_id, nodes);
				nodes_to_insert.push(new_node_id);
			}
		}

		if (!rejected) {
			tr.insert_nodes(nodes_to_insert, marks, annotations, nodes);
			session.apply(tr);
			return true;
		}

		if (tr.selection.path.length >= 2) {
			const next_node_insert_caret = session.get_next_node_insert_caret(tr.selection);
			if (next_node_insert_caret) {
				return try_node_paste(pasted_json, next_node_insert_caret);
			}
		}
		return false;
	}

	async function onpaste(event: ClipboardEvent) {
		// Only handle paste events if editable and focus is within the canvas
		if (!editable) return;
		if (!canvas_el?.contains(document.activeElement)) return;
		event.preventDefault();

		let plain_text,
			pasted_json,
			pasted_media = [];

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
				const html_content = event.clipboardData?.getData('text/html');
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
							const did_paste_nodes = try_node_paste(plain_text_nodes_payload, node_insert_caret);
							if (did_paste_nodes) {
								return;
							}
						}
					}
				} else {
					const target_node_insert_caret = get_target_node_insert_caret(session.selection);
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
			const target_node_insert_caret = get_target_node_insert_caret(session.selection);
			if (target_node_insert_caret) {
				try_node_paste(pasted_json, target_node_insert_caret);
			}
		} else if (typeof plain_text === 'string') {
			// External paste: Fallback to plain text when no svedit data is found
			session.apply(session.tr.insert_text(plain_text));
		}
	}

	function render_selection(dom_driven = false) {
		const selection = session.selection as Selection;

		if (!selection) {
			// No model selection -> just leave things as they are
			// NOTE: removeAllRanges() makes the document lose selection on
			// refocus of the window, hence I disable it for now.
			// let dom_selection = window.getSelection();
			// dom_selection.removeAllRanges();
			return;
		}

		// DOM-driven updates already reflect the new selection — skip
		// the rerender when DOM matches model. Model-driven updates
		// (insert/undo) can have DOM matching by coincidence (Svelte
		// reuses gap elements with shifted data-gap-offset), so for those
		// we always rerender to scroll the cursor into view.
		const is_empty_text_selection =
			selection.type === 'text' && session.get(selection.path).content.length === 0;
		if (dom_driven && !is_empty_text_selection) {
			const prev_selection = __get_selection_from_dom();
			if (
				JSON.stringify(selection) === JSON.stringify(prev_selection) &&
				canvas_el?.contains(document.activeElement)
			) {
				return;
			}
		}

		if (selection?.type === 'text') {
			__render_text_selection();
		} else if (selection?.type === 'node') {
			__render_node_selection();
		} else if (selection?.type === 'property') {
			__render_property_selection();
		} else {
			console.warn('unsupported selection', $state.snapshot(selection));
		}
	}

	// Handle focus - push session's keymap onto stack
	function handle_canvas_focus() {
		// Use flushSync so highlight spans are removed from the DOM
		// immediately, before the browser processes the click's selection.
		flushSync(() => {
			canvas_focused = true;
		});
		key_mapper?.push_scope(session.keymap);
	}

	// Handle blur - pop document's keymap from stack.
	function handle_canvas_blur(event: FocusEvent) {
		// Use flushSync so the selection highlight span (with its CSS anchor)
		// is in the DOM immediately, before any popover/dialog tries to
		// position itself.
		flushSync(() => {
			canvas_focused = false;
		});
		key_mapper?.pop_scope();
		// Predictive inset: unless focus moved to another text input (the
		// keyboard stays up, e.g. a toolbar URL field), the keyboard is
		// closing — drop the inset immediately so CSS consumers glide down
		// with it instead of hanging mid-screen until the OS reports.
		const next = event.relatedTarget as HTMLElement | null;
		if (!next?.closest('input, textarea, select, [contenteditable="true"]')) {
			__publish_keyboard_inset(0);
		}
	}

	function focus_canvas() {
		// Use flushSync so highlight spans are removed from the DOM
		// immediately, before we focus and render_selection walks the
		// text nodes.
		flushSync(() => {
			canvas_focused = true;
		});
		canvas_el?.focus();
	}

	/**
	 * When a DOM selection endpoint lands in a sibling NodeGap (not inside
	 * a node), resolves the adjacent node element for the walk-up algorithm.
	 * @param {HTMLElement} el
	 * @returns {HTMLElement | null}
	 */
	function __resolve_node_from_gap(el: Element): HTMLElement | null {
		const gap = el.closest('[data-gap-array-path]') as HTMLElement | null;
		if (!gap) return null;
		const array_path = deserialize_path(gap.dataset.gapArrayPath);
		const offset = parseInt(gap.dataset.gapOffset, 10);
		const node_idx = offset > 0 ? offset - 1 : 0;
		return canvas_el.querySelector<HTMLElement>(
			`[data-path="${serialize_path([...array_path, node_idx])}"][data-type="node"]`
		) as HTMLElement | null;
	}

	/**
	 * Extracts a NodeSelection from the current DOM selection.
	 *
	 *
	 * @returns {NodeSelection | null} A NodeSelection object if the DOM selection
	 *   represents a valid node selection, null otherwise
	 */
	function __get_node_selection_from_dom(): NodeSelection | null {
		const dom_selection = window.getSelection();
		if (dom_selection.rangeCount === 0) return null;

		let focus_node = dom_selection.focusNode as HTMLElement;
		let anchor_node = dom_selection.anchorNode as HTMLElement;

		// If focus_node or anchor_node not an element node (e.g. a text node), we need
		// to use the parent element, so we can perform the closest() query on it.
		if (focus_node.nodeType !== Node.ELEMENT_NODE) focus_node = focus_node.parentElement;
		if (anchor_node.nodeType !== Node.ELEMENT_NODE) anchor_node = anchor_node.parentElement;

		// EDGE CASE: Collapsed selection inside an empty node placeholder.
		// Firefox can place the DOM selection on the placeholder node itself,
		// which otherwise looks like selecting node index 0 in an empty array.
		const focus_empty_placeholder = focus_node.closest(
			'.empty-node-placeholder[data-path][data-type="node"]'
		) as HTMLElement | null;
		const anchor_empty_placeholder = anchor_node.closest(
			'.empty-node-placeholder[data-path][data-type="node"]'
		) as HTMLElement | null;
		if (focus_empty_placeholder && focus_empty_placeholder === anchor_empty_placeholder) {
			const empty_placeholder_path = deserialize_path(focus_empty_placeholder.dataset.path);
			const array_path = empty_placeholder_path.slice(0, -1);
			const node_array = session.get(array_path);
			if (node_array?.nodes?.length === 0) {
				return {
					type: 'node',
					path: array_path,
					anchor_offset: 0,
					focus_offset: 0
				};
			}
		}

		// EDGE CASE: Collapsed selection inside a node gap (gap-after or gap-before).
		// Gaps are siblings of nodes with data-gap-array-path and data-gap-offset.
		const gap_el = focus_node.closest('[data-gap-array-path]') as HTMLElement | null;
		if (gap_el && focus_node === anchor_node) {
			const array_path = deserialize_path(gap_el.dataset.gapArrayPath);
			const gap_offset = parseInt(gap_el.dataset.gapOffset, 10);
			return {
				type: 'node',
				path: array_path,
				anchor_offset: gap_offset,
				focus_offset: gap_offset
			};
		}

		let focus_root =
			__resolve_node_from_gap(focus_node) ??
			(focus_node.closest('[data-path][data-type="node"]') as HTMLElement);
		if (!focus_root) return null;

		let anchor_root =
			__resolve_node_from_gap(anchor_node) ??
			(anchor_node.closest('[data-path][data-type="node"]') as HTMLElement);
		if (!anchor_root) return null;

		let focus_root_path = deserialize_path(focus_root.dataset.path);
		let anchor_root_path = deserialize_path(anchor_root.dataset.path);
		let focus_node_depth = focus_root_path.length;
		let anchor_node_depth = anchor_root_path.length;

		// Walk both endpoints up the DOM until they share the same parent node_array.
		// This handles selections that span across arbitrarily nested node arrays by
		// finding the lowest common ancestor node_array and projecting each endpoint
		// onto its index within that array.
		let focus_walked_up = false;
		let anchor_walked_up = false;
		while (!paths_equal(focus_root_path.slice(0, -1), anchor_root_path.slice(0, -1))) {
			if (focus_root_path.length > anchor_root_path.length) {
				// Focus is deeper — walk it up
				focus_root = focus_root.parentElement?.closest('[data-path][data-type="node"]');
				if (!focus_root) return null;
				focus_root_path = deserialize_path(focus_root.dataset.path);
				focus_walked_up = true;
			} else if (anchor_root_path.length > focus_root_path.length) {
				// Anchor is deeper — walk it up
				anchor_root = anchor_root.parentElement?.closest('[data-path][data-type="node"]');
				if (!anchor_root) return null;
				anchor_root_path = deserialize_path(anchor_root.dataset.path);
				anchor_walked_up = true;
			} else {
				// Same depth but different node arrays — walk both up
				focus_root = focus_root.parentElement?.closest('[data-path][data-type="node"]');
				if (!focus_root) return null;
				focus_root_path = deserialize_path(focus_root.dataset.path);
				focus_walked_up = true;
				anchor_root = anchor_root.parentElement?.closest('[data-path][data-type="node"]');
				if (!anchor_root) return null;
				anchor_root_path = deserialize_path(anchor_root.dataset.path);
				anchor_walked_up = true;
			}
		}

		// If both paths walked up to the root node, there's no common parent node_array
		// (e.g. selecting between nav and page body). The resulting path would be empty.
		if (anchor_root_path.length <= 1) return null;

		const parent_array_path = anchor_root_path.slice(0, -1);
		// A node selection is only valid inside a node_array property.
		const parent_property = session.inspect(parent_array_path);
		if (!parent_property || parent_property.type !== 'node_array') return null;

		let anchor_offset = Number(anchor_root_path.at(-1));
		let focus_offset = Number(focus_root_path.at(-1));

		// Check if it's a backwards selection
		const is_backwards = __is_dom_selection_backwards();
		if (is_backwards) anchor_offset += 1;
		else focus_offset += 1;

		// EDGE CASE: Exclude first node when anchor_node is a gap-after
		// in a non-collapsed forward selection.
		// Only apply when anchor wasn't walked up — if it was, the gap is at a
		// deeper nesting level and no longer relevant to the resolved node array.
		if (
			!anchor_walked_up &&
			anchor_node.parentElement?.dataset.type === 'gap-after' &&
			!is_backwards &&
			anchor_offset !== focus_offset
		) {
			anchor_offset += 1;
		}
		// EDGE CASE: Exclude first node when focus_node is a gap-after
		// in a non-collapsed backward selection.
		// Only apply when focus wasn't walked up — same reasoning as above.
		else if (
			!focus_walked_up &&
			focus_node.parentElement?.dataset.type === 'gap-after' &&
			is_backwards &&
			anchor_offset !== focus_offset &&
			// EDGE CASE: Only do correction when drag started from a deeper or equally deep anchor node
			anchor_node_depth >= focus_node_depth
		) {
			focus_offset += 1;
		}

		return {
			type: 'node',
			path: parent_array_path,
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
	function __get_property_selection_from_dom(): PropertySelection | null {
		const dom_selection = window.getSelection();
		if (dom_selection.rangeCount === 0) return null;

		let focus_root = dom_selection.focusNode.parentElement?.closest(
			'[data-path][data-type="property"]'
		) as HTMLElement;
		if (!focus_root) return null;
		let anchor_root = dom_selection.anchorNode.parentElement?.closest(
			'[data-path][data-type="property"]'
		) as HTMLElement;
		if (!anchor_root) return null;

		if (focus_root === anchor_root) {
			return {
				type: 'property',
				path: deserialize_path(focus_root.dataset.path)
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
	function __get_text_selection_from_dom(
		range: Range | StaticRange | null = null
	): TextSelection | null {
		let dom_selection: globalThis.Selection | null = null;
		let focus_node: Node | null;
		let anchor_node: Node | null;
		let focus_offset_in_node: number; // anchor_offset_in_node;

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

		function get_text_root(node: Node | null): HTMLElement | null {
			if (!node) return null;

			if (node instanceof Element) {
				return node.closest<HTMLElement>('[data-path][data-type="text"]');
			}

			return node.parentElement?.closest<HTMLElement>('[data-path][data-type="text"]') ?? null;
		}

		let focus_root: HTMLElement | null;
		let anchor_root: HTMLElement | null;

		if (
			focus_node === anchor_node &&
			focus_node instanceof HTMLElement &&
			focus_node.dataset.type === 'text'
		) {
			// EDGE CASE 1: Either text node is empty (only a <br> is present), or caret is after a <br> at the very end of the text node
			focus_root = anchor_root = focus_node;
		} else {
			focus_root = get_text_root(focus_node);
			if (!focus_root) return null;

			anchor_root = get_text_root(anchor_node);
			if (!anchor_root) return null;
		}

		if (focus_root !== anchor_root) {
			return null;
		}

		const path = deserialize_path(focus_root.dataset.path);

		if (!path) return null;

		// EDGE CASE 1B: Caret after trailing <br> at end of text
		//
		// TextProperty renders a trailing <br> for non-empty or non-focused text.
		// When the user places their caret after this <br>, focusNode is the container
		// element (not a text node), and normal processing would return position 0.
		// We detect this and return the current DOM text length instead.
		// During compositionend, the browser has already inserted the composed
		// character into the DOM, while the Svedit model still has the old text.
		const dom_text_length = get_char_length(focus_root.textContent ?? '');
		const child_nodes = focus_root.childNodes;

		if (
			range.collapsed &&
			focus_node === anchor_node &&
			focus_node === focus_root &&
			focus_root.dataset?.type === 'text' &&
			!focus_root.classList.contains('empty')
		) {
			// Find the last non-comment child node (comments are inserted by Svelte)
			let last_element_index = child_nodes.length - 1;
			while (
				last_element_index >= 0 &&
				child_nodes[last_element_index].nodeType === Node.COMMENT_NODE
			) {
				last_element_index--;
			}

			// Check if caret is at or after the trailing <br>
			if (
				last_element_index >= 0 &&
				child_nodes[last_element_index].nodeName === 'BR' &&
				focus_offset_in_node >= last_element_index
			) {
				return {
					type: 'text',
					path,
					anchor_offset: dom_text_length,
					focus_offset: dom_text_length
				};
			}
		}

		function get_text_offset(container: Node, offset: number): number {
			const offset_range = window.document.createRange();
			offset_range.setStart(focus_root, 0);
			offset_range.setEnd(container, offset);
			return get_char_length(offset_range.toString());
		}

		const start_offset = get_text_offset(range.startContainer, range.startOffset);
		const end_offset = get_text_offset(range.endContainer, range.endOffset);

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

	function __get_node_element(node_array_path: DocumentPath, node_offset: number): Element | null {
		if (!canvas_el) return null;
		return canvas_el.querySelector(
			`[data-path="${serialize_path([...node_array_path, node_offset])}"][data-type="node"]`
		);
	}

	/**
	 * True when any part of the element's border box overlaps the window
	 * viewport. Used to keep node-selection re-renders from scrolling a
	 * cursor that is already on screen. Tests the window viewport, so a
	 * node clipped only by an inner scroll container still counts visible.
	 * @param {Element | null | undefined} el
	 */
	function __intersects_viewport(el: Element | null | undefined): boolean {
		if (!el) return false;
		return __rect_intersects_viewport(el.getBoundingClientRect());
	}

	/** True when any part of the rect overlaps the window viewport. */
	function __rect_intersects_viewport(r: DOMRect): boolean {
		return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
	}

	/**
	 * Screen rect of the cursor position at (node, offset), or null when
	 * no geometry is available (element offsets, e.g. empty text). A
	 * collapsed range's own getBoundingClientRect is empty on Safari, so
	 * when it comes back zero-height we measure the adjacent character
	 * and return its matching edge as a zero-width caret rect.
	 */
	function __get_caret_rect(node: Node, offset: number): DOMRect | null {
		const range = window.document.createRange();
		range.setStart(node, offset);
		range.collapse(true);
		const rect = range.getBoundingClientRect();
		if (rect.height > 0) return rect;
		if (node instanceof Text) {
			if (offset < node.length) {
				range.setEnd(node, offset + 1);
				const after = range.getBoundingClientRect();
				if (after.height > 0) return new DOMRect(after.left, after.top, 0, after.height);
			}
			if (offset > 0) {
				range.setStart(node, offset - 1);
				range.setEnd(node, offset);
				const before = range.getBoundingClientRect();
				if (before.height > 0) return new DOMRect(before.right, before.top, 0, before.height);
			}
		}
		return null;
	}

	/**
	 * Minimal scroll delta that brings the span [start, end] into the
	 * viewport axis [min, max] with a bit of breathing room. 0 when no
	 * scroll is needed.
	 */
	function __scroll_delta(start: number, end: number, min: number, max: number): number {
		const margin = 32;
		if (start < min + margin) return start - (min + margin);
		if (end > max - margin) return end - (max - margin);
		return 0;
	}

	/**
	 * Nearest ancestor that actually scrolls vertically. Null when the
	 * window (the document itself) is the scroller. Horizontal-only
	 * scrollers (carousels, table wrappers) are skipped — vertical cursor
	 * corrections applied to them would silently do nothing.
	 */
	function __get_scroll_container(el: Element | null): HTMLElement | null {
		let current = el?.parentElement ?? null;
		while (current && current !== window.document.body) {
			const style = getComputedStyle(current);
			if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) {
				return current;
			}
			current = current.parentElement;
		}
		return null;
	}

	/**
	 * Computed scroll-padding value → px. 'auto' resolves to 0 and
	 * percentages resolve against the scrollport size, so host-declared
	 * percentage padding cannot skew the band math.
	 */
	function __resolve_scroll_padding(value: string, scrollport_size: number): number {
		if (value.endsWith('%')) return ((parseFloat(value) || 0) / 100) * scrollport_size;
		return parseFloat(value) || 0;
	}

	/**
	 * The band a cursor must sit in to count as visible: the window
	 * viewport intersected with the visual viewport (the software keyboard
	 * shrinks it — a platform fact, read fresh here so no app wiring can
	 * go stale) and the scroll container (when any), inset by the
	 * scroller's declared scroll-padding (floating app UI like toolbars —
	 * an app fact, measured from the visual viewport's edges).
	 */
	function __get_reveal_bounds(container: HTMLElement | null, predicted_keyboard_inset = 0) {
		const scroller_style = getComputedStyle(
			container ?? window.document.scrollingElement ?? window.document.documentElement
		);
		const rect = container?.getBoundingClientRect();
		const vv = window.visualViewport;
		const port_w = container?.clientWidth ?? window.innerWidth;
		const port_h = container?.clientHeight ?? window.innerHeight;
		const pad_l = __resolve_scroll_padding(scroller_style.scrollPaddingLeft, port_w);
		const pad_r = __resolve_scroll_padding(scroller_style.scrollPaddingRight, port_w);
		const pad_t = __resolve_scroll_padding(scroller_style.scrollPaddingTop, port_h);
		const pad_b = __resolve_scroll_padding(scroller_style.scrollPaddingBottom, port_h);
		// The padding subtracts from the VISIBLE edges (box ∩ window ∩
		// visual viewport). Floating UI like the toolbar is pinned to the
		// visible bottom (it rides the keyboard inset), so that anchor is
		// the correct one for it. When a scroller overdraws the viewport
		// for chrome-zone painting, its box-anchored overdraw share makes
		// the band slightly conservative — deliberate: one simple rule
		// that errs toward extra visibility, never toward hiding.
		return {
			min_x: Math.max(rect?.left ?? 0, 0, vv?.offsetLeft ?? 0) + pad_l,
			max_x:
				Math.min(
					rect?.right ?? Infinity,
					window.innerWidth,
					vv ? vv.offsetLeft + vv.width : Infinity
				) - pad_r,
			min_y: Math.max(rect?.top ?? 0, 0, vv?.offsetTop ?? 0) + pad_t,
			max_y:
				Math.min(
					rect?.bottom ?? Infinity,
					window.innerHeight - predicted_keyboard_inset,
					vv ? vv.offsetTop + vv.height : Infinity
				) - pad_b
		};
	}

	function __render_node_selection() {
		const selection = session.selection as NodeSelection;
		const node_array_path = selection.path;
		const node_array_path_str = serialize_path(node_array_path);
		const is_collapsed = is_selection_collapsed(selection);
		const is_backward = !is_collapsed && selection.anchor_offset > selection.focus_offset;

		const node_array_el = canvas_el.querySelector(
			`[data-path="${node_array_path_str}"][data-type="node_array"]`
		);
		if (!node_array_el) return;

		const dom_selection = window.getSelection();
		const range = window.document.createRange();

		const gap_selector = (offset: number) =>
			`[data-gap-array-path="${node_array_path_str}"][data-gap-offset="${offset}"]`;

		if (is_collapsed) {
			const gap_el = node_array_el.querySelector(gap_selector(selection.anchor_offset));
			if (!gap_el) return;
			// Target .svedit-selectable (has a box), not gap_el which is
			// display:contents and would cause the browser to normalize
			// the range into the parent, breaking read-back.
			const selectable = gap_el.querySelector('.svedit-selectable');
			if (!selectable) return;
			range.setStart(selectable, 1);
			range.setEnd(selectable, 1);
			dom_selection.removeAllRanges();
			dom_selection.addRange(range);
		} else {
			const anchor_gap = node_array_el.querySelector(gap_selector(selection.anchor_offset));
			const focus_gap = node_array_el.querySelector(gap_selector(selection.focus_offset));
			if (!anchor_gap || !focus_gap) return;
			const anchor_sel = anchor_gap.querySelector('.svedit-selectable');
			const focus_sel = focus_gap.querySelector('.svedit-selectable');
			if (!anchor_sel || !focus_sel) return;

			if (is_backward) {
				// setBaseAndExtent replaces the current selection, so no
				// removeAllRanges is needed — every selection-API call forces a
				// synchronous layout when the DOM is dirty, and this runs right
				// after the per-change reconcile on every apply.
				dom_selection.setBaseAndExtent(anchor_sel, 1, focus_sel, 1);
			} else {
				range.setStart(anchor_sel, 1);
				range.setEnd(focus_sel, 1);
				dom_selection.removeAllRanges();
				dom_selection.addRange(range);
			}
		}

		// Scroll the cursor into view, but only when it is genuinely
		// off-screen. This runs on every node-selection re-render — a
		// transaction (type/layout change), select-parent, window refocus
		// — so an unconditional scroll would yank the viewport on each of
		// them. cursor_offset is a gap offset and the gap has no box of
		// its own, so visibility is judged from the nodes flanking it.
		const node_array = session.get(node_array_path);
		if (!node_array?.nodes) return;

		// Collapsed: anchor === focus, so focus is the gap offset.
		// Range: cursor sits at the focus end (anchor when backward).
		const cursor_offset = is_backward ? selection.anchor_offset : selection.focus_offset;
		const array_length = node_array.nodes.length;

		// node_before is null at offset 0: cursor_offset - 1 would be -1,
		// and serialize_path rejects a negative index.
		const node_before =
			cursor_offset > 0 ? __get_node_element(node_array_path, cursor_offset - 1) : null;
		const node_after = __get_node_element(node_array_path, cursor_offset);

		let scroll_target = null;
		let scroll_array_to_start = false;
		let scroll_array_to_end = false;

		if (cursor_offset === 0) {
			scroll_array_to_start = true;
		} else if (cursor_offset >= array_length) {
			scroll_array_to_end = true;
		} else {
			// A range selection's selected node IS node_before; scrolling
			// node_after would reveal the following node and leave the
			// selection itself off-screen. For a collapsed caret node_after's
			// leading edge is the cursor, so that stays the right target.
			scroll_target = is_collapsed ? node_after : node_before;
		}

		setTimeout(() => {
			// If either node flanking the cursor is already (even
			// partially) on screen, the cursor is visible — keep the
			// viewport stable and scroll nothing. Do this layout read in the
			// deferred callback, after Svelte/browser layout has settled.
			if (__intersects_viewport(node_before) || __intersects_viewport(node_after)) return;

			if (scroll_array_to_start) {
				node_array_el.scrollLeft = 0;
				node_array_el.scrollTop = 0;
				return;
			}
			if (scroll_array_to_end) {
				const max_left = Math.max(0, node_array_el.scrollWidth - node_array_el.clientWidth);
				const max_top = Math.max(0, node_array_el.scrollHeight - node_array_el.clientHeight);
				node_array_el.scrollLeft = max_left;
				node_array_el.scrollTop = max_top;
				if (max_left === 0 && max_top === 0) {
					node_before?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
				}
				return;
			}
			scroll_target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}, 0);
	}

	function __render_property_selection() {
		const selection = session.selection;
		// The element that holds the property
		const el = canvas_el.querySelector<HTMLElement>(
			`[data-path="${serialize_path(selection.path)}"][data-type="property"]`
		);

		const gap_selectable = el.querySelector('.svedit-selectable');
		const range = window.document.createRange();
		const dom_selection = window.getSelection();

		// Select the entire gap element contents and collapse to start
		range.selectNodeContents(gap_selectable);
		range.collapse(true); // Collapse to start position
		dom_selection.removeAllRanges();
		dom_selection.addRange(range);

		// Scroll the selection into view
		setTimeout(() => {
			el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}, 0);
	}

	function __render_text_selection() {
		const selection = session.selection as TextSelection;
		// The element that holds the annotated string
		const el = canvas_el.querySelector<HTMLElement>(
			`[data-path="${serialize_path(selection.path)}"][data-type="text"]`
		);
		const empty_text = session.get(selection.path).content.length === 0;
		const dom_selection = window.getSelection();
		let current_offset = 0;
		let anchor_node: HTMLElement | Text;
		let focus_node: HTMLElement | Text;
		let anchor_node_offset: number;
		let focus_node_offset: number;
		const is_backward = selection.anchor_offset > selection.focus_offset;
		const start_offset = Math.min(selection.anchor_offset, selection.focus_offset);
		const end_offset = Math.max(selection.anchor_offset, selection.focus_offset);

		// Helper function to process each node
		function process_node(node: Node) {
			if (node instanceof Text) {
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
			} else if (node instanceof HTMLElement) {
				for (const child_node of node.childNodes) {
					if (process_node(child_node)) return true; // Stop iteration if end found
				}
			}
			return false; // Continue iteration
		}

		// EDGE CASE: When text is empty, we need to set a different DOM selection
		if (start_offset === end_offset && start_offset === 0 && empty_text) {
			// Markup for empty text looks like this `<div data-type="text"><br></div>`.
			// And the correct caret position is after the <br> element.
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
			// NOTE: Only using setBaseAndExtent() will preserve selection direction.
			// It also replaces the current selection, so no removeAllRanges is
			// needed — every selection-API call forces a synchronous layout when
			// the DOM is dirty, and this runs on every apply.
			dom_selection.setBaseAndExtent(
				anchor_node,
				anchor_node_offset,
				focus_node,
				focus_node_offset
			);

			// Scroll the cursor into view, but only when no part of the rendered
			// selection is on screen — an unconditional scroll would yank the
			// viewport on every re-render (e.g. annotation toggles). Capture the
			// nodes now: the browser selection is live and may be cleared before
			// this deferred callback runs, e.g. when app UI focuses an external
			// input.
			const selected_element = focus_node.parentElement;
			setTimeout(() => {
				try {
					if (anchor_node.isConnected && focus_node.isConnected) {
						const range = window.document.createRange();
						if (is_backward) {
							range.setStart(focus_node, focus_node_offset);
							range.setEnd(anchor_node, anchor_node_offset);
						} else {
							range.setStart(anchor_node, anchor_node_offset);
							range.setEnd(focus_node, focus_node_offset);
						}
						// Visibility and correction both use the reveal band: the
						// scroller's viewport clamped by the visual viewport
						// (keyboard) minus its declared scroll-padding (floating
						// UI). Cursor geometry comes from __get_caret_rect — a
						// collapsed range's own rect is empty on Safari, so a
						// plain getBoundingClientRect would misreport every caret.
						const container = __get_scroll_container(selected_element ?? null);
						const bounds = __get_reveal_bounds(container);
						const guard_rect = range.collapsed
							? __get_caret_rect(focus_node, focus_node_offset)
							: range.getBoundingClientRect();
						// Any part of the rendered selection inside the band
						// counts as visible — keep the viewport stable then.
						if (
							guard_rect &&
							guard_rect.bottom > bounds.min_y &&
							guard_rect.top < bounds.max_y &&
							guard_rect.right > bounds.min_x &&
							guard_rect.left < bounds.max_x
						) {
							return;
						}

						// Off-band: reveal the cursor rect itself. The fallback
						// below scrolls the focus node's parent — for unannotated
						// text that is the whole text property, where 'nearest' on
						// an element taller than the viewport merely aligns its
						// closest edge, possibly far from the cursor (e.g. undo of
						// an edit near the start of a long text). scrollIntoView
						// first so nested scroll containers reveal the element,
						// then correct the owning scroller by the cursor's
						// remaining offset. No caret rect (element offset, e.g.
						// empty text) means no cursor geometry — coarse fallback.
						if (__get_caret_rect(focus_node, focus_node_offset)) {
							selected_element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
							const moved = __get_caret_rect(focus_node, focus_node_offset);
							if (moved) {
								const dx = __scroll_delta(moved.left, moved.right, bounds.min_x, bounds.max_x);
								const dy = __scroll_delta(moved.top, moved.bottom, bounds.min_y, bounds.max_y);
								if (dx || dy) {
									if (container) {
										container.scrollLeft += dx;
										container.scrollTop += dy;
									} else {
										window.scrollBy(dx, dy);
									}
								}
								return;
							}
						}
					}
				} catch {
					// Offsets can go stale if the DOM changed since capture —
					// fall through to the coarse scroll below.
				}
				if (selected_element?.isConnected) {
					selected_element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
				}
			}, 0);
		}
	}

	// Utils
	// --------------------------

	function __remove_native_composition_text(
		selection: TextSelection | null,
		inserted_text: string
	) {
		if (!selection || selection.type !== 'text' || !inserted_text) return;

		const text_el = canvas_el.querySelector(
			`[data-path="${serialize_path(selection.path)}"][data-type="text"]`
		);
		if (!text_el) return;

		const model_text = session.get(selection.path).content;
		if ((text_el.textContent ?? '') === model_text) return;

		let current_offset = 0;
		function get_dom_text_position(
			root: Node,
			target_offset: number
		): { node: Node; offset: number } | null {
			for (const node of root.childNodes) {
				if (node.nodeType === Node.TEXT_NODE) {
					const node_text = node.textContent ?? '';
					const node_length = get_char_length(node_text);
					if (current_offset + node_length >= target_offset) {
						return {
							node,
							offset: char_to_utf16_offset(node_text, target_offset - current_offset)
						};
					}
					current_offset += node_length;
				} else if (node.nodeType === Node.ELEMENT_NODE) {
					const position = get_dom_text_position(node, target_offset);
					if (position) return position;
				}
			}
			return null;
		}

		const start_offset = Math.min(selection.anchor_offset, selection.focus_offset);
		const end_offset = start_offset + get_char_length(inserted_text);
		current_offset = 0;
		const start_position = get_dom_text_position(text_el, start_offset);
		current_offset = 0;
		const end_position = get_dom_text_position(text_el, end_offset);
		if (!start_position || !end_position) return;

		const range = window.document.createRange();
		range.setStart(start_position.node, start_position.offset);
		range.setEnd(end_position.node, end_position.offset);
		range.deleteContents();
	}

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

	// Whenever the model selection changes, render the selection.
	// Skip when canvas is not focused to avoid stealing focus back
	// (e.g., when a dialog is open and selection highlight fragments re-render).
	// Consume the dom-driven flag at the top so it never carries stale
	// state into the next change, even when we early-return.
	$effect(() => {
		session.selection;
		const dom_driven = selection_source_is_dom;
		selection_source_is_dom = false;
		if (!canvas_focused) return;
		render_selection(dom_driven);
	});
</script>

<!--
  TODO: We must get rid of the global handlers here, so Svedit doesn't conflict
  with any app-specific event handling.
-->
<svelte:document {onselectionchange} {oncut} {oncopy} {onpaste} />

<!-- TODO: move oncut/copy/paste handlers inside .svedit -->
<div class="svedit" class:editable>
	<!-- Overlays must be before canvas so they initialize first. -->
	{#if editable}<NodeSelectionMarkers />{/if}
	{#if Overlays}<Overlays />{/if}
	<!--
		inputmode is derived from the model selection: node and property
		selections set inputmode="none" so iOS does not open the virtual
		keyboard for them. Text selections — and crucially NO selection —
		allow the keyboard via inputmode="text": the no-selection state is
		what the server renders and what a tap lands on before hydration,
		and iOS ignores inputmode changes on an already-focused element, so
		defaulting to "none" would leave an early tap keyboard-less until
		the next blur/refocus. The browser's native selection-change flow
		updates session.selection on tap, which flips this attribute before
		iOS decides whether to show the keyboard — no imperative state
		tracking, drag detection, or click/pointerdown handlers are
		required for keyboard suppression.
	-->
	<div
		class="svedit-canvas {css_class}"
		class:hide-selection={editable && session.selection?.type === 'node'}
		class:node-caret={session.selection?.type === 'node' &&
			session.selection.anchor_offset === session.selection.focus_offset}
		class:property-selection={session.selection?.type === 'property'}
		bind:this={canvas_el}
		{onbeforeinput}
		{oncompositionstart}
		{oncompositionend}
		onfocus={handle_canvas_focus}
		onblur={handle_canvas_blur}
		inputmode={!session.selection || session.selection.type === 'text' ? 'text' : 'none'}
		contenteditable={editable ? 'true' : 'false'}
		tabindex="-1"
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
</div>

<style>
	.svedit {
		/* Containing block for the anchor-positioned markers and overlays
		   rendered alongside the canvas. With it inside the scroll content
		   they scroll natively with the content on the compositor; without
		   it their containing block is the viewport, and in nested-scroller
		   layouts they would only move via main-thread anchor re-snapshots
		   — one frame behind the scroll, visibly lagging. */
		position: relative;
		/* Scope marker/overlay z-indices to the editor so they can never
		   paint over host page chrome (sticky headers, dropdowns) when
		   Svedit is embedded in a larger page. */
		isolation: isolate;
	}

	.svedit-canvas {
		caret-color: var(--svedit-caret-color);
		caret-shape: bar;
		/* Default to vertical/ column flow with: --row: 0; (the most common case)
		Prevents silent failures when developers forget to set the row property in their top level node component.
		TODO: Warn developers in dev mode via console if they forget to set the --row property and use a different flow.*/
		--row: 0;
		&:focus {
			outline: none;
		}
	}

	/* Selection paint — wrapped in :where() so consumers can override with
	   a plain `::selection` rule. Svelte still adds the scope hash inside
	   the :where(), but the wrapper zeroes its specificity contribution.
	   Final specificity is just (0,0,1), trivially beatable. */
	:where(.svedit-canvas) :global(::selection) {
		background: var(--svedit-editing-fill);
	}

	@media not (pointer: coarse) {
		.svedit-canvas.hide-selection {
			caret-color: transparent;
		}
	}

	/* When the caret is in a node gap we never want to see the caret */
	.svedit-canvas.node-caret,
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
