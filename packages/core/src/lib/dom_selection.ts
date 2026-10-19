// Mapping between the native DOM selection and the session's selection
// model, in both directions, shared by the Svelte, React, Vue and Solid editor
// components. The components decide *when* to render (after their
// framework has flushed the DOM); the rendering itself is plain DOM work.
import type Session from './Session.js';
import type {
	DocumentSchema,
	NodeSelection,
	PropertySelection,
	Selection,
	TextSelection
} from './types.js';
import {
	char_to_utf16_offset,
	deserialize_path,
	get_char_length,
	is_selection_collapsed,
	paths_equal,
	serialize_path
} from './utils.js';
import { get_node_element, intersects_viewport } from './canvas_dom.js';

export function is_dom_selection_backwards(): boolean {
	const dom_selection = window.getSelection();

	// If there's no dom_selection, return false
	if (dom_selection.rangeCount === 0) return false;

	// Get the range of the dom_selection
	const range = dom_selection.getRangeAt(0);

	if (range.collapsed) return false;

	// Create a new range for comparison
	const comparison_range = range.cloneRange();

	// Set the comparison range to start at the dom_selection's anchor and end at its focus
	comparison_range.setStart(dom_selection.anchorNode, dom_selection.anchorOffset);
	comparison_range.setEnd(dom_selection.focusNode, dom_selection.focusOffset);

	// If the comparison range is collapsed, the selection is backwards
	return comparison_range.collapsed;
}

/**
 * When a DOM selection endpoint lands in a sibling NodeGap (not inside
 * a node), resolves the adjacent node element for the walk-up algorithm.
 */
export function resolve_node_from_gap(canvas_el: HTMLElement, el: Element): HTMLElement | null {
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
 * @returns A NodeSelection object if the DOM selection
 *   represents a valid node selection, null otherwise
 */
export function get_node_selection_from_dom<S extends DocumentSchema>(
	session: Session<S>,
	canvas_el: HTMLElement
): NodeSelection | null {
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
		resolve_node_from_gap(canvas_el, focus_node) ??
		(focus_node.closest('[data-path][data-type="node"]') as HTMLElement);
	if (!focus_root) return null;

	let anchor_root =
		resolve_node_from_gap(canvas_el, anchor_node) ??
		(anchor_node.closest('[data-path][data-type="node"]') as HTMLElement);
	if (!anchor_root) return null;

	let focus_root_path = deserialize_path(focus_root.dataset.path);
	let anchor_root_path = deserialize_path(anchor_root.dataset.path);
	const focus_node_depth = focus_root_path.length;
	const anchor_node_depth = anchor_root_path.length;

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
	const is_backwards = is_dom_selection_backwards();
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
 * @returns A PropertySelection object if the DOM selection
 *   represents a valid property selection, null otherwise
 */
export function get_property_selection_from_dom(): PropertySelection | null {
	const dom_selection = window.getSelection();
	if (dom_selection.rangeCount === 0) return null;

	const focus_root = dom_selection.focusNode.parentElement?.closest(
		'[data-path][data-type="property"]'
	) as HTMLElement;
	if (!focus_root) return null;
	const anchor_root = dom_selection.anchorNode.parentElement?.closest(
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

/**
 * Extracts a TextSelection from the current DOM selection.
 *
 * @returns A TextSelection object if the DOM selection
 *   represents a valid text selection, null otherwise
 */
export function get_text_selection_from_dom(
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
	const is_backward = dom_selection ? is_dom_selection_backwards() : false;

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

/**
 * Maps the current DOM selection to a model selection: a property selection,
 * a text selection or a node selection, in that order of preference.
 */
export function get_selection_from_dom<S extends DocumentSchema>(
	session: Session<S>,
	canvas_el: HTMLElement
): Selection | null {
	return (
		get_property_selection_from_dom() ||
		get_text_selection_from_dom() ||
		get_node_selection_from_dom(session, canvas_el)
	);
}

// ===== Model -> DOM: rendering the session selection =====

/**
 * Renders the session selection as the native DOM selection inside the
 * canvas, and scrolls it into view when asked to. Called by the editor
 * components whenever the selection, the document or the canvas focus
 * changes.
 *
 * @param dom_driven - the selection change came from the DOM (the user
 *   moved the caret); skip the rerender when the DOM already matches
 * @param should_scroll_selection_into_view - scroll the rendered selection
 *   into view (only when it moved, see the editor components)
 */
export function render_selection<S extends DocumentSchema>(
	session: Session<S>,
	canvas_el: HTMLElement,
	dom_driven = false,
	should_scroll_selection_into_view = true
): void {
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
	// (insert/undo) can have DOM matching by coincidence (the framework
	// may reuse gap elements with shifted data-gap-offset), so for those
	// we always rerender to scroll the cursor into view.
	const is_empty_text_selection =
		selection.type === 'text' && session.get(selection.path).content.length === 0;
	if (dom_driven && !is_empty_text_selection) {
		const prev_selection = get_selection_from_dom(session, canvas_el);
		if (
			JSON.stringify(selection) === JSON.stringify(prev_selection) &&
			canvas_el?.contains(document.activeElement)
		) {
			return;
		}
	}

	if (selection?.type === 'text') {
		render_text_selection(session, canvas_el, should_scroll_selection_into_view);
	} else if (selection?.type === 'node') {
		render_node_selection(session, canvas_el, should_scroll_selection_into_view);
	} else if (selection?.type === 'property') {
		render_property_selection(session, canvas_el, should_scroll_selection_into_view);
	} else {
		console.warn('unsupported selection', selection);
	}
}

/** Renders a text selection (see `render_selection`). */
export function render_text_selection<S extends DocumentSchema>(
	session: Session<S>,
	canvas_el: HTMLElement,
	should_scroll_selection_into_view = true
): void {
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
	function process_node(node: globalThis.Node) {
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
		// And the correct caret position is after the <br> element. While the
		// empty text is focused, TextProperty drops the <br>: depending on the
		// framework the element then holds only comment anchors (Svelte) or no
		// children at all (React, Vue, Solid), where the only valid caret position is 0.
		const caret_offset = Math.min(1, el.childNodes.length);
		anchor_node = el;
		anchor_node_offset = caret_offset;
		focus_node = el;
		focus_node_offset = caret_offset;
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
		dom_selection.setBaseAndExtent(anchor_node, anchor_node_offset, focus_node, focus_node_offset);

		if (should_scroll_selection_into_view) {
			// Scroll the rendered selection into view. Capture the target now:
			// the browser selection is live and may be cleared before this
			// deferred callback runs, e.g. when app UI focuses an external input.
			const selected_element = focus_node.parentElement;
			setTimeout(() => {
				if (selected_element?.isConnected) {
					selected_element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
				}
			}, 0);
		}
	}
}

/** Renders a node selection (see `render_selection`). */
export function render_node_selection<S extends DocumentSchema>(
	session: Session<S>,
	canvas_el: HTMLElement,
	should_scroll_selection_into_view = true
): void {
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
	if (!should_scroll_selection_into_view) return;

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
		cursor_offset > 0 ? get_node_element(canvas_el, node_array_path, cursor_offset - 1) : null;
	const node_after = get_node_element(canvas_el, node_array_path, cursor_offset);

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
		// deferred callback, after framework/browser layout has settled.
		if (intersects_viewport(node_before) || intersects_viewport(node_after)) return;

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

/** Renders a property selection (see `render_selection`). */
export function render_property_selection<S extends DocumentSchema>(
	session: Session<S>,
	canvas_el: HTMLElement,
	should_scroll_selection_into_view = true
): void {
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

	if (should_scroll_selection_into_view) {
		setTimeout(() => {
			el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}, 0);
	}
}
