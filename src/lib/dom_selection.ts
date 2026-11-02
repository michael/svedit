/**
 * Mapping between the native DOM selection and Svedit selections.
 *
 * The DOM selection is the source of truth: every Svedit selection has a
 * native representation (text inside a text property, a caret inside a
 * node gap, a caret inside a custom property), so contenteditable can keep
 * doing cursor movement and selection expansion.
 */

import {
	get_char_length,
	char_to_utf16_offset,
	deserialize_path,
	paths_equal,
	serialize_path,
	is_selection_collapsed,
	PATH_SEPARATOR
} from './utils.js';
import type { NodeSelection, PropertySelection, Selection, TextSelection } from './types.js';
import type Session from './Session.svelte.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySession = Session<any>;

const NODE = '[data-path][data-type="node"]';

const element_of = (node: Node): HTMLElement =>
	(node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement;

export function selections_equal(a: Selection | null, b: Selection | null): boolean {
	if (!a || !b) return a === b;
	if (a.type !== b.type || !paths_equal(a.path, b.path)) return false;
	if (a.type === 'property' || b.type === 'property') return true;
	return a.anchor_offset === b.anchor_offset && a.focus_offset === b.focus_offset;
}

/** Whether the DOM selection's focus lies before its anchor. */
export function is_dom_selection_backwards(): boolean {
	const dom_selection = window.getSelection();
	if (!dom_selection?.rangeCount) return false;
	const range = dom_selection.getRangeAt(0);
	if (range.collapsed) return false;
	// A range from anchor to focus collapses when focus comes first
	const forward = range.cloneRange();
	forward.setStart(dom_selection.anchorNode!, dom_selection.anchorOffset);
	forward.setEnd(dom_selection.focusNode!, dom_selection.focusOffset);
	return forward.collapsed;
}

/**
 * Text selection of the DOM selection, or of a given range (e.g. an input
 * event's target range, whose direction is unknown).
 */
export function read_text_selection(
	range: Range | StaticRange | null = null
): TextSelection | null {
	const dom_selection = range ? null : window.getSelection();
	if (dom_selection && dom_selection.rangeCount === 0) return null;
	const focus_node = range ? range.endContainer : dom_selection!.focusNode;
	const anchor_node = range ? range.startContainer : dom_selection!.anchorNode;
	const focus_offset_in_node = range ? range.endOffset : dom_selection!.focusOffset;
	range ??= dom_selection!.getRangeAt(0);

	const text_root = (node: Node | null) =>
		node ? (element_of(node)?.closest<HTMLElement>('[data-path][data-type="text"]') ?? null) : null;
	// An empty text (just a <br>) or a caret after a trailing <br> puts the
	// selection on the text element itself
	const is_text_element =
		focus_node === anchor_node &&
		focus_node instanceof HTMLElement &&
		focus_node.dataset.type === 'text';
	const root = is_text_element ? (focus_node as HTMLElement) : text_root(focus_node);
	if (!root || root !== (is_text_element ? root : text_root(anchor_node))) return null;
	const path = deserialize_path(root.dataset.path!);

	// A caret at or after the trailing <br> of a non-empty text is at its
	// end. The DOM text length is used, since during compositionend the
	// browser already inserted the composed character into the DOM.
	if (
		range.collapsed &&
		focus_node === anchor_node &&
		focus_node === root &&
		!root.classList.contains('empty')
	) {
		let last = root.childNodes.length - 1;
		while (last >= 0 && root.childNodes[last].nodeType === Node.COMMENT_NODE) last--;
		if (last >= 0 && root.childNodes[last].nodeName === 'BR' && focus_offset_in_node >= last) {
			const length = get_char_length(root.textContent ?? '');
			return { type: 'text', path, anchor_offset: length, focus_offset: length };
		}
	}

	const offset_of = (container: Node, offset: number) => {
		const offset_range = document.createRange();
		offset_range.setStart(root, 0);
		offset_range.setEnd(container, offset);
		return get_char_length(offset_range.toString());
	};
	const start_offset = offset_of(range.startContainer, range.startOffset);
	const end_offset = offset_of(range.endContainer, range.endOffset);
	const is_backward = dom_selection ? is_dom_selection_backwards() : false;
	return {
		type: 'text',
		path,
		anchor_offset: is_backward ? end_offset : start_offset,
		focus_offset: is_backward ? start_offset : end_offset
	};
}

/** Property selection when both DOM endpoints are inside the same custom property. */
function read_property_selection(): PropertySelection | null {
	const dom_selection = window.getSelection();
	if (!dom_selection?.rangeCount) return null;
	const property_root = (node: Node | null) =>
		node?.parentElement?.closest<HTMLElement>('[data-path][data-type="property"]');
	const focus_root = property_root(dom_selection.focusNode);
	if (!focus_root || focus_root !== property_root(dom_selection.anchorNode)) return null;
	return { type: 'property', path: deserialize_path(focus_root.dataset.path!) };
}

/**
 * Node selection of the DOM selection. Both endpoints are projected onto
 * their nodes in the lowest common node array, so selections can span
 * arbitrarily nested node arrays.
 */
function read_node_selection(session: AnySession, canvas_el: HTMLElement): NodeSelection | null {
	const dom_selection = window.getSelection();
	if (!dom_selection?.rangeCount) return null;
	const focus_el = element_of(dom_selection.focusNode!);
	const anchor_el = element_of(dom_selection.anchorNode!);

	// Firefox can put a caret on an empty node array's placeholder itself
	const placeholder = focus_el.closest<HTMLElement>(`.empty-node-placeholder${NODE}`);
	if (placeholder && placeholder === anchor_el.closest(`.empty-node-placeholder${NODE}`)) {
		const array_path = deserialize_path(placeholder.dataset.path!).slice(0, -1);
		if (session.get(array_path)?.nodes?.length === 0) {
			return { type: 'node', path: array_path, anchor_offset: 0, focus_offset: 0 };
		}
	}

	// A collapsed caret inside a node gap
	const gap = focus_el.closest<HTMLElement>('[data-gap-array-path]');
	if (gap && focus_el === anchor_el) {
		const offset = parseInt(gap.dataset.gapOffset!, 10);
		return {
			type: 'node',
			path: deserialize_path(gap.dataset.gapArrayPath!),
			anchor_offset: offset,
			focus_offset: offset
		};
	}

	// An endpoint inside a gap belongs to the node before it (or the first node)
	const node_root = (el: HTMLElement) => {
		const gap = el.closest<HTMLElement>('[data-gap-array-path]');
		if (!gap) return el.closest<HTMLElement>(NODE);
		const offset = parseInt(gap.dataset.gapOffset!, 10);
		const path = `${gap.dataset.gapArrayPath}${PATH_SEPARATOR}${offset > 0 ? offset - 1 : 0}`;
		return (
			canvas_el.querySelector<HTMLElement>(`[data-path="${path}"][data-type="node"]`) ??
			el.closest<HTMLElement>(NODE)
		);
	};
	let focus_root = node_root(focus_el);
	let anchor_root = node_root(anchor_el);
	if (!focus_root || !anchor_root) return null;
	let focus_path = deserialize_path(focus_root.dataset.path!);
	let anchor_path = deserialize_path(anchor_root.dataset.path!);
	const focus_depth = focus_path.length;
	const anchor_depth = anchor_path.length;
	let focus_walked_up = false;
	let anchor_walked_up = false;

	// Walk the deeper endpoint (or both) up until both share a node array
	while (!paths_equal(focus_path.slice(0, -1), anchor_path.slice(0, -1))) {
		const walk_focus = focus_path.length >= anchor_path.length;
		const walk_anchor = anchor_path.length >= focus_path.length;
		if (walk_focus) {
			focus_root = focus_root.parentElement?.closest<HTMLElement>(NODE) ?? null;
			if (!focus_root) return null;
			focus_path = deserialize_path(focus_root.dataset.path!);
			focus_walked_up = true;
		}
		if (walk_anchor) {
			anchor_root = anchor_root.parentElement?.closest<HTMLElement>(NODE) ?? null;
			if (!anchor_root) return null;
			anchor_path = deserialize_path(anchor_root.dataset.path!);
			anchor_walked_up = true;
		}
	}

	// Endpoints only sharing the root node have no common node array
	if (anchor_path.length <= 1) return null;
	const array_path = anchor_path.slice(0, -1);
	if (session.inspect(array_path)?.type !== 'node_array') return null;

	let anchor_offset = Number(anchor_path.at(-1));
	let focus_offset = Number(focus_path.at(-1));
	const is_backward = is_dom_selection_backwards();
	if (is_backward) anchor_offset += 1;
	else focus_offset += 1;

	// A range starting in the gap after a node excludes that node. Only
	// relevant while the endpoint was not walked up from a deeper array.
	const in_gap_after = (el: HTMLElement) => el.parentElement?.dataset.type === 'gap-after';
	if (anchor_offset !== focus_offset) {
		if (!anchor_walked_up && !is_backward && in_gap_after(anchor_el)) {
			anchor_offset += 1;
		} else if (
			!focus_walked_up &&
			is_backward &&
			in_gap_after(focus_el) &&
			anchor_depth >= focus_depth
		) {
			focus_offset += 1;
		}
	}
	return { type: 'node', path: array_path, anchor_offset, focus_offset };
}

export function read_selection(session: AnySession, canvas_el: HTMLElement): Selection | null {
	return (
		read_property_selection() || read_text_selection() || read_node_selection(session, canvas_el)
	);
}

/** The DOM position of a character offset inside an element's text nodes. */
function find_text_position(
	root: Node,
	char_offset: number
): { node: Node; offset: number } | null {
	let current = 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node.textContent ?? '';
		const length = get_char_length(text);
		if (current + length >= char_offset)
			return { node, offset: char_to_utf16_offset(text, char_offset - current) };
		current += length;
	}
	return null;
}

function select_dom(anchor: Node, anchor_offset: number, focus: Node, focus_offset: number): void {
	// setBaseAndExtent replaces the selection (no removeAllRanges needed)
	// and preserves its direction
	window.getSelection()?.setBaseAndExtent(anchor, anchor_offset, focus, focus_offset);
}

const scroll_into_view = (el: Element | null | undefined) =>
	el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

/** Whether part of an element's border box overlaps the window viewport. */
function intersects_viewport(el: Element | null | undefined): boolean {
	if (!el) return false;
	const rect = el.getBoundingClientRect();
	return (
		rect.bottom > 0 &&
		rect.top < window.innerHeight &&
		rect.right > 0 &&
		rect.left < window.innerWidth
	);
}

function write_text_selection(
	session: AnySession,
	canvas_el: HTMLElement,
	selection: TextSelection,
	scroll: boolean
) {
	const el = canvas_el.querySelector<HTMLElement>(
		`[data-path="${serialize_path(selection.path)}"][data-type="text"]`
	);
	if (!el) return;
	let anchor: { node: Node; offset: number } | null;
	let focus: { node: Node; offset: number } | null;
	if (session.get(selection.path).content.length === 0) {
		// Empty text renders `<div data-type="text"><br></div>`, the caret goes after the <br>
		anchor = focus = { node: el, offset: 1 };
	} else {
		anchor = find_text_position(el, selection.anchor_offset);
		focus = find_text_position(el, selection.focus_offset);
	}
	if (!anchor || !focus) return;
	select_dom(anchor.node, anchor.offset, focus.node, focus.offset);
	if (!scroll) return;
	// Captured now: the live selection may be gone when the timeout runs
	const target = focus.node.parentElement;
	setTimeout(() => {
		if (target?.isConnected) scroll_into_view(target);
	}, 0);
}

function write_node_selection(
	session: AnySession,
	canvas_el: HTMLElement,
	selection: NodeSelection,
	scroll: boolean
) {
	const array_path = serialize_path(selection.path);
	const array_el = canvas_el.querySelector<HTMLElement>(
		`[data-path="${array_path}"][data-type="node_array"]`
	);
	if (!array_el) return;
	// The gap wrapper is display:contents; targeting it would make the browser
	// normalize the range into the parent and break read-back
	const gap_selectable = (offset: number) =>
		array_el.querySelector(
			`[data-gap-array-path="${array_path}"][data-gap-offset="${offset}"] .svedit-selectable`
		);
	const anchor = gap_selectable(selection.anchor_offset);
	const focus = is_selection_collapsed(selection) ? anchor : gap_selectable(selection.focus_offset);
	if (!anchor || !focus) return;
	select_dom(anchor, 1, focus, 1);
	if (!scroll) return;

	// Only scroll when the cursor is off-screen: this runs on every
	// node selection rerender. Gaps have no box, so visibility is judged
	// from the nodes flanking the cursor (at the focus end of a range).
	const length = session.get(selection.path)?.nodes?.length;
	if (length === undefined) return;
	const node_el = (index: number) =>
		index < 0
			? null
			: canvas_el.querySelector(
					`[data-path="${array_path}${PATH_SEPARATOR}${index}"][data-type="node"]`
				);
	const is_backward = selection.anchor_offset > selection.focus_offset;
	const cursor = is_backward ? selection.anchor_offset : selection.focus_offset;
	const node_before = node_el(cursor - 1);
	const node_after = node_el(cursor);
	setTimeout(() => {
		// Read layout once Svelte and the browser have settled
		if (intersects_viewport(node_before) || intersects_viewport(node_after)) return;
		if (cursor === 0) {
			array_el.scrollLeft = 0;
			array_el.scrollTop = 0;
		} else if (cursor >= length) {
			const max_left = Math.max(0, array_el.scrollWidth - array_el.clientWidth);
			const max_top = Math.max(0, array_el.scrollHeight - array_el.clientHeight);
			array_el.scrollLeft = max_left;
			array_el.scrollTop = max_top;
			// An array that doesn't scroll itself needs the document to scroll
			if (max_left === 0 && max_top === 0) scroll_into_view(node_before);
		} else {
			// A selected range's last node is node_before; for a caret, the next node's leading edge is the cursor
			scroll_into_view(is_selection_collapsed(selection) ? node_after : node_before);
		}
	}, 0);
}

function write_property_selection(
	canvas_el: HTMLElement,
	selection: PropertySelection,
	scroll: boolean
) {
	const el = canvas_el.querySelector(
		`[data-path="${serialize_path(selection.path)}"][data-type="property"]`
	);
	const selectable = el?.querySelector('.svedit-selectable');
	if (!selectable) return;
	select_dom(selectable, 0, selectable, 0);
	if (scroll) setTimeout(() => scroll_into_view(el), 0);
}

/** Render a Svedit selection as the native DOM selection. */
export function write_selection(
	session: AnySession,
	canvas_el: HTMLElement,
	selection: Selection,
	scroll: boolean
): void {
	if (selection.type === 'text') write_text_selection(session, canvas_el, selection, scroll);
	else if (selection.type === 'node') write_node_selection(session, canvas_el, selection, scroll);
	else if (selection.type === 'property') write_property_selection(canvas_el, selection, scroll);
	else console.warn('unsupported selection', selection);
}

/**
 * Firefox may not undo the DOM of a native composition. Removes the composed
 * text when it is still present, before the Svedit transaction applies it.
 */
export function remove_native_composition_text(
	session: AnySession,
	canvas_el: HTMLElement,
	selection: TextSelection | null,
	inserted_text: string
): void {
	if (selection?.type !== 'text' || !inserted_text) return;
	const el = canvas_el.querySelector(
		`[data-path="${serialize_path(selection.path)}"][data-type="text"]`
	);
	if (!el || (el.textContent ?? '') === session.get(selection.path).content) return;
	const start_offset = Math.min(selection.anchor_offset, selection.focus_offset);
	const start = find_text_position(el, start_offset);
	const end = find_text_position(el, start_offset + get_char_length(inserted_text));
	if (!start || !end) return;
	const range = document.createRange();
	range.setStart(start.node, start.offset);
	range.setEnd(end.node, end.offset);
	range.deleteContents();
}
