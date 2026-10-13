// Helpers that read or patch the DOM inside the editor canvas, shared by the
// Svelte, React and Vue editor components.
import type Session from './Session.js';
import type { DocumentPath, DocumentSchema, TextSelection } from './types.js';
import { char_to_utf16_offset, get_char_length, serialize_path } from './utils.js';

/**
 * Warns when a path is mounted more than once inside the canvas. Within a
 * single Svedit document, each path may be mounted exactly once.
 */
export function check_duplicate_paths(canvas_el: HTMLElement | undefined): void {
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

/** The element rendering the node at `node_offset` of the node array at `node_array_path`. */
export function get_node_element(
	canvas_el: HTMLElement | undefined,
	node_array_path: DocumentPath,
	node_offset: number
): Element | null {
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
 */
export function intersects_viewport(el: Element | null | undefined): boolean {
	if (!el) return false;
	const r = el.getBoundingClientRect();
	return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

/**
 * Removes text the browser inserted natively during a composition when its
 * undo did not revert the DOM (Firefox), so the DOM matches the model again
 * before the composed text is inserted through a transaction.
 */
export function remove_native_composition_text<S extends DocumentSchema>(
	session: Session<S>,
	canvas_el: HTMLElement,
	selection: TextSelection | null,
	inserted_text: string
): void {
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
