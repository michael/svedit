import type {
	Attachment,
	Mark,
	Text,
	SelectionRange,
	Selection,
	DocumentSchema,
	DocumentNode,
	DocumentPath,
	NodeId
} from './types.js';

const SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' });

// Every code unit below U+0300 is a grapheme of its own, except CR (CRLF is
// one grapheme). Strings without such characters skip Intl.Segmenter.
const COMPLEX_TEXT = /\r|[\u0300-\uffff]/;

function graphemes(str: string): string[] {
	return Array.from(SEGMENTER.segment(str), (segment) => segment.segment);
}

/**
 * Detect if the virtual keyboard is likely visible.
 *
 * The visual viewport shrinks below the layout viewport when a virtual
 * keyboard opens. The tolerance absorbs fractional viewport heights on
 * desktop browsers with HiDPI scaling.
 */
export function is_virtual_keyboard_active(): boolean {
	if (typeof window === 'undefined' || !is_mobile_browser() || !window.visualViewport) return false;
	return window.visualViewport.height < document.documentElement.clientHeight - 50;
}

/**
 * Detect if the current browser is likely on a mobile device. Uses the user
 * agent only, so touch-capable laptops are not treated as mobile browsers.
 */
export function is_mobile_browser(): boolean {
	return (
		typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent)
	);
}

/** Detect if the current browser is Chrome on desktop. */
export function is_chrome_desktop_browser(): boolean {
	if (typeof navigator === 'undefined') return false;
	const user_agent = navigator.userAgent;
	return user_agent.includes('Chrome') && !user_agent.includes('Edg') && !is_mobile_browser();
}

/**
 * Get the length of a string in grapheme clusters, so emojis and other
 * complex Unicode sequences count as single characters.
 *
 * @example
 * get_char_length('a😀b') // Returns: 3
 */
export function get_char_length(str: string): number {
	if (!COMPLEX_TEXT.test(str)) return str.length;
	let length = 0;
	const segments = SEGMENTER.segment(str)[Symbol.iterator]();
	while (!segments.next().done) length++;
	return length;
}

/** Get the grapheme cluster at the given character position. */
export function get_char_at(str: string, index: number): string {
	return COMPLEX_TEXT.test(str) ? graphemes(str)[index] : str[index];
}

/**
 * Slice a string by grapheme cluster positions.
 *
 * @example
 * char_slice('a👋🏽b', 1, 2) // Returns: '👋🏽'
 */
export function char_slice(str: string, start: number, end?: number): string {
	if (!COMPLEX_TEXT.test(str)) return str.slice(start, end);
	return graphemes(str).slice(start, end).join('');
}

/**
 * Convert a UTF-16 code unit offset (as used by DOM selections) into a
 * grapheme cluster offset. Offsets inside a cluster snap to its start.
 */
export function utf16_to_char_offset(str: string, utf16_offset: number): number {
	if (!COMPLEX_TEXT.test(str)) return Math.max(0, Math.min(utf16_offset, str.length));
	let char_offset = 0;
	for (const { index, segment } of SEGMENTER.segment(str)) {
		if (index + segment.length > utf16_offset) break;
		char_offset++;
	}
	return char_offset;
}

/** Convert a grapheme cluster offset into a UTF-16 code unit offset. */
export function char_to_utf16_offset(str: string, char_offset: number): number {
	if (!COMPLEX_TEXT.test(str)) return Math.max(0, Math.min(char_offset, str.length));
	let utf16_offset = 0;
	let count = 0;
	for (const { segment } of SEGMENTER.segment(str)) {
		if (count++ >= char_offset) break;
		utf16_offset += segment.length;
	}
	return utf16_offset;
}

/**
 * Split a text value at a character position. Marks and annotations that
 * span the split point are divided between both parts.
 */
export function split_text(text_value: Text, at_position: number): [Text, Text] {
	const left: Text = {
		content: char_slice(text_value.content, 0, at_position),
		marks: [],
		annotations: []
	};
	const right: Text = {
		content: char_slice(text_value.content, at_position),
		marks: [],
		annotations: []
	};
	for (const key of ['marks', 'annotations'] as const) {
		for (const { start_offset, end_offset, node_id } of text_value[key] ?? []) {
			if (start_offset < at_position) {
				left[key].push({ start_offset, end_offset: Math.min(end_offset, at_position), node_id });
			}
			if (end_offset > at_position) {
				right[key].push({
					start_offset: Math.max(start_offset - at_position, 0),
					end_offset: end_offset - at_position,
					node_id
				});
			}
		}
	}
	return [left, right];
}

/**
 * Join two text values. Ranges of the second text are shifted, and a range
 * that continues the last range of the first text with the same node is merged.
 */
export function join_text(first_text: Text, second_text: Text): Text {
	const offset = get_char_length(first_text.content);
	const joined: Text = {
		content: first_text.content + second_text.content,
		marks: [],
		annotations: []
	};
	for (const key of ['marks', 'annotations'] as const) {
		const ranges = (first_text[key] ?? []).map((range) => ({ ...range }));
		for (const { start_offset, end_offset, node_id } of second_text[key] ?? []) {
			const last = ranges.at(-1);
			if (last && last.end_offset === start_offset + offset && last.node_id === node_id) {
				last.end_offset = end_offset + offset;
			} else {
				ranges.push({
					start_offset: start_offset + offset,
					end_offset: end_offset + offset,
					node_id
				});
			}
		}
		joined[key] = ranges;
	}
	return joined;
}

/**
 * Convert a snake_case string to PascalCase.
 *
 * @example
 * snake_to_pascal('list_item') // Returns: 'ListItem'
 */
export function snake_to_pascal(str: string): string {
	return str
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join('');
}

export const PATH_SEPARATOR = '__';
const PATH_STRING_SEGMENT_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const PATH_INDEX_SEGMENT_RE = /^(0|[1-9]\d*)$/;
// Segments repeat across paths (node ids, property names), so they are checked once
const valid_segments = new Set<string>();

/**
 * Check whether a string can be used as a Svedit path segment (node ids and
 * schema property names). The restriction keeps serialized paths reversible,
 * valid as HTML ids, and safe as CSS anchor-name suffixes.
 */
export function is_path_string_segment_valid(segment: string): boolean {
	if (valid_segments.has(segment)) return true;
	const valid =
		typeof segment === 'string' &&
		PATH_STRING_SEGMENT_RE.test(segment) &&
		!segment.includes(PATH_SEPARATOR);
	if (valid) valid_segments.add(segment);
	return valid;
}

/** Assert that a string can be used as a Svedit path segment. */
export function assert_path_string_segment(segment: string, label = 'Path segment'): void {
	if (!is_path_string_segment_valid(segment)) {
		throw new Error(
			`${label} must start with a letter or underscore and contain only letters, numbers, underscores, or dashes. It must not contain "${PATH_SEPARATOR}".`
		);
	}
}

/**
 * Serialize a document path, preserving whether each segment is a string
 * key or an array index. The result is usable as a data attribute value,
 * HTML id, or CSS anchor-name suffix.
 *
 * @example
 * serialize_path(['page_1', 'body', 0, 'items']) // Returns: 'page_1__body__0__items'
 */
export function serialize_path(path: DocumentPath): string {
	let result = '';
	for (let index = 0; index < path.length; index++) {
		const segment = path[index];
		if (typeof segment === 'number') {
			if (!Number.isInteger(segment) || segment < 0) {
				throw new Error(`Path index must be a non-negative integer: ${segment}`);
			}
		} else {
			assert_path_string_segment(segment);
		}
		result += index === 0 ? segment : PATH_SEPARATOR + segment;
	}
	return result;
}

/**
 * Deserialize a path string produced by serialize_path.
 *
 * @example
 * deserialize_path('page_1__body__0__items') // Returns: ['page_1', 'body', 0, 'items']
 */
export function deserialize_path(serialized_path: string): DocumentPath {
	if (serialized_path === '') return [];
	return serialized_path.split(PATH_SEPARATOR).map((segment) => {
		if (segment === '') throw new Error(`Invalid serialized path: ${serialized_path}`);
		if (/^\d+$/.test(segment)) {
			if (!PATH_INDEX_SEGMENT_RE.test(segment)) {
				throw new Error(`Invalid serialized path index: ${segment}`);
			}
			return Number(segment);
		}
		assert_path_string_segment(segment, 'Serialized path segment');
		return segment;
	});
}

/** Compare two document paths segment by segment, preserving segment types. */
export function paths_equal(a: DocumentPath, b: DocumentPath): boolean {
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
	return true;
}

/**
 * Call `visit` once per outgoing node reference of a node: `node`
 * properties, `node_array` entries, and the payload nodes of marks and
 * annotations on `text` and `node_array` properties. Multiplicity matters
 * for reference counting, so repeated references are visited repeatedly.
 */
export function for_each_reference(
	schema: DocumentSchema,
	node: DocumentNode,
	visit: (node_id: NodeId) => void
): void {
	const properties = schema[node.type]?.properties;
	for (const name in properties) {
		const type = properties[name].type;
		const value = node[name];
		if (value == null) continue;
		if (type === 'node') {
			if (typeof value === 'string') visit(value);
			continue;
		}
		if (type !== 'node_array' && type !== 'text') continue;
		if (type === 'node_array') for (const id of value.nodes ?? []) visit(id);
		for (const range of value.marks ?? []) visit(range.node_id);
		for (const range of value.annotations ?? []) visit(range.node_id);
	}
}

/**
 * Node ids reachable from a node in depth-first order: leaves first, the
 * entry point last. Never clones nodes.
 */
export function traverse_ids(
	node_id: string,
	schema: DocumentSchema,
	nodes: Record<string, DocumentNode>
): string[] {
	const ids: string[] = [];
	const visited = new Set<string>();
	const visit = (id: string) => {
		const node = nodes[id];
		if (!node || visited.has(id)) return;
		visited.add(id);
		for_each_reference(schema, node, visit);
		ids.push(id);
	};
	visit(node_id);
	return ids;
}

/**
 * Deep copies of the nodes reachable from a node in depth-first order:
 * leaves first, branches second, the entry point last. Unreachable nodes
 * are not included.
 */
export function traverse(
	node_id: string,
	schema: DocumentSchema,
	nodes: Record<string, DocumentNode>
): DocumentNode[] {
	return traverse_ids(node_id, schema, nodes).map((id) => structuredClone(nodes[id]));
}

/**
 * The normalized range (start <= end) of a text or node selection, or null
 * for property selections and missing selections.
 */
export function get_selection_range(selection?: Selection | null): SelectionRange | null {
	if (!selection || selection.type === 'property') return null;
	return {
		start_offset: Math.min(selection.anchor_offset, selection.focus_offset),
		end_offset: Math.max(selection.anchor_offset, selection.focus_offset)
	};
}

export function is_selection_collapsed(selection?: Selection | null): boolean {
	return (
		!!selection &&
		selection.type !== 'property' &&
		selection.anchor_offset === selection.focus_offset
	);
}

/**
 * Adjust ranges (marks or annotations) after deleting [start, end) from a
 * sequence (text characters or node array entries). Ranges that become
 * empty are dropped and their node ids reported.
 */
export function adjust_ranges_for_deletion(
	ranges: Array<Attachment>,
	start: number,
	end: number
): { ranges: Array<Attachment>; removed_node_ids: string[] } {
	const removed_node_ids: string[] = [];
	const shift = (offset: number) =>
		offset >= end ? offset - (end - start) : Math.min(offset, start);
	const next_ranges: Attachment[] = [];
	for (const range of ranges) {
		if (range.end_offset <= start) {
			next_ranges.push(range);
			continue;
		}
		const start_offset = shift(range.start_offset);
		const end_offset = shift(range.end_offset);
		if (start_offset >= end_offset) removed_node_ids.push(range.node_id);
		else next_ranges.push({ start_offset, end_offset, node_id: range.node_id });
	}
	return { ranges: next_ranges, removed_node_ids };
}

/**
 * Adjust ranges (marks or annotations) after inserting into a sequence.
 * Insertion inside a range extends it, insertion at either edge stays outside.
 */
export function adjust_ranges_for_insertion(
	ranges: Array<Attachment>,
	offset: number,
	length: number
): Array<Attachment> {
	if (length === 0) return ranges;
	return ranges.map((range) => {
		if (range.end_offset <= offset) return range;
		return {
			start_offset: range.start_offset < offset ? range.start_offset : range.start_offset + length,
			end_offset: range.end_offset + length,
			node_id: range.node_id
		};
	});
}

/** Check whether ranges are non-empty, within bounds, and mutually exclusive. */
export function are_ranges_exclusive(ranges: Array<Attachment>, length = Infinity): boolean {
	const sorted = [...ranges].sort(
		(a, b) => a.start_offset - b.start_offset || a.end_offset - b.end_offset
	);
	return sorted.every(
		(range, index) =>
			Number.isInteger(range.start_offset) &&
			Number.isInteger(range.end_offset) &&
			range.start_offset >= 0 &&
			range.start_offset < range.end_offset &&
			range.end_offset <= length &&
			(index === 0 || range.start_offset >= sorted[index - 1].end_offset)
	);
}

/**
 * A fragment range calculated from a sequence length, marks, and an optional
 * selection highlight range.
 */
export type FragmentRange = {
	type: 'content' | 'mark' | 'selection_highlight';
	start_offset: number;
	end_offset: number;
	mark_index?: number;
	node_id?: string;
};

/**
 * Split a sequence of the given length into content, mark and selection
 * highlight fragments. Marks and the highlight must not overlap.
 */
export function calculate_fragment_ranges(
	length: number,
	marks: Array<Mark>,
	selection_highlight_range?: SelectionRange | null
): Array<FragmentRange> {
	const ranges: Array<FragmentRange> = marks.map((mark, mark_index) => ({
		type: 'mark',
		start_offset: mark.start_offset,
		end_offset: mark.end_offset,
		node_id: mark.node_id,
		mark_index
	}));
	if (selection_highlight_range)
		ranges.push({ type: 'selection_highlight', ...selection_highlight_range });
	ranges.sort((a, b) => a.start_offset - b.start_offset);

	const fragments: Array<FragmentRange> = [];
	let last_index = 0;
	for (const range of ranges) {
		if (range.start_offset > last_index) {
			fragments.push({ type: 'content', start_offset: last_index, end_offset: range.start_offset });
		}
		fragments.push(range);
		last_index = range.end_offset;
	}
	if (last_index < length)
		fragments.push({ type: 'content', start_offset: last_index, end_offset: length });
	return fragments;
}
