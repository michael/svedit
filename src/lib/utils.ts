import type {
	Attachment,
	Mark,
	AnnotatedText,
	SelectionRange,
	Selection,
	DocumentSchema,
	DocumentNode,
	DocumentPath
} from './types.js';

const SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Detect if the virtual keyboard is likely visible.
 *
 * This is a heuristic based on the visual viewport becoming smaller than the
 * layout viewport.
 */
export function is_virtual_keyboard_active(): boolean {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return false;
	}

	const visual_viewport = window.visualViewport;
	if (!visual_viewport) {
		return false;
	}

	return visual_viewport.height < document.documentElement.clientHeight;
}

/**
 * Detect if the current browser is likely on a mobile device.
 *
 * This uses the user agent only so touch-capable laptops are not treated as
 * mobile browsers.
 */
export function is_mobile_browser(): boolean {
	if (typeof navigator === 'undefined') {
		return false;
	}

	const user_agent = navigator.userAgent;
	return /iPhone|iPad|iPod|Android|Mobile/i.test(user_agent);
}

// ‼️‼️‼️‼️‼️‼️ UNUSED UTILITY BELOW ‼️‼️‼️‼️‼️‼️
/**
 * Detect if the current browser is Chrome on desktop
 */
export function is_chrome_desktop_browser(): boolean {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') {
		return false;
	}
	const user_agent = navigator.userAgent;
	const is_chrome = user_agent.includes('Chrome') && !user_agent.includes('Edg');
	const is_mobile = is_mobile_browser();
	return is_chrome && !is_mobile;
}

/**
 * Get the actual character length (accounting for multi-byte characters)
 *
 * Uses Intl.Segmenter to count grapheme clusters rather than UTF-16 code units,
 * ensuring emojis and other complex Unicode sequences are counted as single characters.
 *
 * @example
 * get_char_length('Hello') // Returns: 5
 * get_char_length('a😀b') // Returns: 3 (not 4)
 * get_char_length('👋🏽') // Returns: 1 (not 4 - skin tone modifier treated as single char)
 */
export function get_char_length(str: string): number {
	return [...SEGMENTER.segment(str)].length;
}

// ‼️‼️‼️‼️‼️‼️ UNUSED UTILITY BELOW ‼️‼️‼️‼️‼️‼️
/**
 * Get a single character at the specified position (accounting for multi-byte characters)
 *
 * Uses Intl.Segmenter to access grapheme clusters rather than UTF-16 code units,
 * ensuring emojis and other complex Unicode sequences are treated as single characters.
 *
 * @example
 * get_char_at('Hello', 1) // Returns: 'e'
 * get_char_at('a😀b', 1) // Returns: '😀' (full emoji)
 * get_char_at('👋🏽', 0) // Returns: '👋🏽' (skin tone modifier included)
 */
export function get_char_at(str: string, index: number): string {
	const segments = [...SEGMENTER.segment(str)];
	return segments[index].segment;
}

/**
 * Slice string by character positions (accounting for multi-byte characters)
 *
 * Uses Intl.Segmenter to slice by grapheme clusters rather than UTF-16 code units,
 * ensuring emojis and other complex Unicode sequences remain intact.
 *
 * @example
 * char_slice('Hello 😀 World', 6, 8) // Returns: '😀 ' (emoji stays intact)
 * char_slice('a👋🏽b', 1, 2) // Returns: '👋🏽' (skin tone modifier included)
 */
export function char_slice(str: string, start: number, end: number | undefined = undefined): string {
	const segments = [...SEGMENTER.segment(str)];
	return segments
		.slice(start, end)
		.map((s) => s.segment)
		.join('');
}

/**
 * Convert UTF-16 code unit offset to grapheme cluster offset within a string
 *
 * Converts DOM selection offsets (which use UTF-16 code units) to character-based
 * offsets (grapheme clusters) for consistent text manipulation.
 *
 * @example
 * // For string "a😀b" where 😀 uses 2 UTF-16 code units
 * utf16_to_char_offset("a😀b", 3) // Returns: 2 (position after emoji)
 */
export function utf16_to_char_offset(str: string, utf16_offset: number): number {
	const segments = [...SEGMENTER.segment(str)];
	let char_offset = 0;
	let utf16_count = 0;

	for (const segment of segments) {
		if (utf16_count >= utf16_offset) break;
		utf16_count += segment.segment.length;
		if (utf16_count > utf16_offset) break;
		char_offset++;
	}

	return char_offset;
}

/**
 * Convert grapheme cluster offset to UTF-16 code unit offset within a string
 *
 * Converts character-based offsets (grapheme clusters) to DOM selection offsets
 * (UTF-16 code units) for proper DOM selection positioning.
 *
 * @example
 * // For string "a😀b" where 😀 uses 2 UTF-16 code units
 * char_to_utf16_offset("a😀b", 2) // Returns: 3 (UTF-16 position after emoji)
 */
export function char_to_utf16_offset(str: string, char_offset: number): number {
	const segments = [...SEGMENTER.segment(str)];
	let utf16_offset = 0;

	for (let i = 0; i < Math.min(char_offset, segments.length); i++) {
		utf16_offset += segments[i].segment.length;
	}

	return utf16_offset;
}

/**
 * Splits an annotated text at the specified character position.
 *
 * Marks and annotations that span the split point will be divided
 * appropriately, with offsets adjusted for each resulting part.
 *
 * @example
 * split_text({content: "Hello world", marks: [{start_offset: 6, end_offset: 11, node_id: "strong"}], annotations: []}, 8)
 * // Returns:
 * // [
 * //   {content: "Hello wo", marks: [{start_offset: 6, end_offset: 8, node_id: "strong"}], annotations: []},
 * //   {content: "rld", marks: [{start_offset: 0, end_offset: 3, node_id: "strong"}], annotations: []}
 * // ]
 */
export function split_text(
	text_value: AnnotatedText,
	at_position: number
): [AnnotatedText, AnnotatedText] {
	const { content } = text_value;

	// Split the text using character-aware slicing
	const left: AnnotatedText = {
		content: char_slice(content, 0, at_position),
		marks: [],
		annotations: []
	};
	const right: AnnotatedText = {
		content: char_slice(content, at_position),
		marks: [],
		annotations: []
	};

	// Process marks and annotations with the same range logic
	for (const key of ['marks', 'annotations'] as const) {
		for (const { start_offset, end_offset, node_id } of text_value[key] ?? []) {
			if (end_offset <= at_position) {
				// Range is entirely in the left part
				left[key].push({ start_offset, end_offset, node_id });
			} else if (start_offset >= at_position) {
				// Range is entirely in the right part - shift offsets
				right[key].push({
					start_offset: start_offset - at_position,
					end_offset: end_offset - at_position,
					node_id
				});
			} else {
				// Range spans the split point - split it
				left[key].push({ start_offset, end_offset: at_position, node_id });
				right[key].push({ start_offset: 0, end_offset: end_offset - at_position, node_id });
			}
		}
	}

	return [left, right];
}

/**
 * Joins two annotated texts into a single annotated text.
 *
 * Marks and annotations from the second text will have their offsets shifted
 * by the length of the first text. Adjacent ranges referencing the same node
 * will be merged.
 *
 * @example
 * join_text({content: "Hello wo", marks: [{start_offset: 6, end_offset: 8, node_id: "strong"}], annotations: []}, {content: "rld", marks: [{start_offset: 0, end_offset: 3, node_id: "strong"}], annotations: []})
 * // Returns: {content: "Hello world", marks: [{start_offset: 6, end_offset: 11, node_id: "strong"}], annotations: []}
 */
export function join_text(first_text: AnnotatedText, second_text: AnnotatedText): AnnotatedText {
	// Join the text content
	const joined: AnnotatedText = {
		content: first_text.content + second_text.content,
		marks: [],
		annotations: []
	};

	const offset = get_char_length(first_text.content);

	for (const key of ['marks', 'annotations'] as const) {
		// Start with all ranges from the first text (unchanged)
		const joined_ranges = (first_text[key] ?? []).map((range) => ({ ...range }));

		// Add ranges from the second text, shifting their offsets
		for (const { start_offset, end_offset, node_id } of second_text[key] ?? []) {
			const shifted_range = {
				start_offset: start_offset + offset,
				end_offset: end_offset + offset,
				node_id
			};

			// Check if this range can be merged with the last range from the first text
			const last_range = joined_ranges[joined_ranges.length - 1];
			if (
				last_range &&
				last_range.end_offset === shifted_range.start_offset && // ranges are adjacent
				last_range.node_id === shifted_range.node_id
			) {
				// same node_id
				// Merge by extending the end position of the last range
				last_range.end_offset = shifted_range.end_offset;
			} else {
				// Add as separate range
				joined_ranges.push(shifted_range);
			}
		}

		joined[key] = joined_ranges;
	}

	return joined;
}

/**
 * Convert snake_case string to PascalCase
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

/**
 * Check whether a string can be used as a Svedit path segment.
 *
 * Path string segments include node ids and schema property names. Keeping
 * them restricted makes serialized paths reversible, valid as HTML ids, and
 * safe to use as CSS anchor-name suffixes.
 */
export function is_path_string_segment_valid(segment: string): boolean {
	return (
		typeof segment === 'string' &&
		PATH_STRING_SEGMENT_RE.test(segment) &&
		!segment.includes(PATH_SEPARATOR)
	);
}

/**
 * Assert that a string can be used as a Svedit path segment.
 */
export function assert_path_string_segment(segment: string, label = 'Path segment'): void {
	if (!is_path_string_segment_valid(segment)) {
		throw new Error(
			`${label} must start with a letter or underscore and contain only letters, numbers, underscores, or dashes. It must not contain "${PATH_SEPARATOR}".`
		);
	}
}

/**
 * Serialize a document path while preserving whether each segment is a
 * property/key string or an array index number.
 *
 * The result is reversible and safe to use as a data attribute value, HTML id,
 * or CSS anchor-name suffix.
 *
 * @example
 * serialize_path(['page_1', 'body', 0, 'items']) // Returns: 'page_1__body__0__items'
 */
export function serialize_path(path: DocumentPath): string {
	return path
		.map((segment) => {
			if (typeof segment === 'number') {
				if (!Number.isInteger(segment) || segment < 0) {
					throw new Error(`Path index must be a non-negative integer: ${segment}`);
				}
				return String(segment);
			}

			assert_path_string_segment(segment);
			return segment;
		})
		.join(PATH_SEPARATOR);
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
		if (segment === '') {
			throw new Error(`Invalid serialized path: ${serialized_path}`);
		}

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

/**
 * Compare two document paths segment-by-segment, preserving segment types.
 */
export function paths_equal(a: DocumentPath, b: DocumentPath): boolean {
	if (a.length !== b.length) return false;
	return a.every((segment, index) => segment === b[index]);
}

/**
 * Like traverse, but returns only node ids in depth-first order and never
 * clones nodes. Use this when only the reachable id set is needed (e.g.
 * reference bookkeeping) — traverse() deep-clones every visited node,
 * which is wasteful for id-only consumers.
 *
 * @returns Node ids in depth-first order (entry point last)
 */
export function traverse_ids(
	node_id: string,
	schema: DocumentSchema,
	nodes: Record<string, DocumentNode>
): string[] {
	const ids: string[] = [];
	const visited: Record<string, boolean> = {};
	const visit = (node: DocumentNode | undefined) => {
		if (!node || visited[node.id]) {
			return;
		}
		visited[node.id] = true;
		for (const [property_name, value] of Object.entries(node)) {
			const property_definition = schema[node.type].properties[property_name];

			if (property_definition?.type === 'node_array') {
				for (const v of value?.nodes || []) {
					if (typeof v === 'string') {
						visit(nodes[v]);
					}
				}
				for (const range of [...(value?.marks || []), ...(value?.annotations || [])]) {
					visit(nodes[range.node_id]);
				}
			} else if (property_definition?.type === 'node') {
				visit(nodes[value]);
			} else if (property_definition?.type === 'text') {
				for (const range of [...(value.marks || []), ...(value.annotations || [])]) {
					visit(nodes[range.node_id]);
				}
			}
		}
		ids.push(node.id);
	};
	visit(nodes[node_id]);
	return ids;
}

export function traverse(
	node_id: string,
	schema: DocumentSchema,
	nodes: Record<string, DocumentNode>
): DocumentNode[] {
	const json: DocumentNode[] = [];
	const visited: Record<string, boolean> = {};
	const visit = (node: DocumentNode | undefined) => {
		if (!node || visited[node.id]) {
			return;
		}
		visited[node.id] = true;
		for (const [property_name, value] of Object.entries(node)) {
			const property_definition = schema[node.type].properties[property_name];

			if (property_definition?.type === 'node_array') {
				const node_ids = value?.nodes || [];

				for (const v of node_ids) {
					if (typeof v === 'string') {
						visit(nodes[v]);
					}
				}

				for (const range of [...(value?.marks || []), ...(value?.annotations || [])]) {
					visit(nodes[range.node_id]);
				}
			} else if (property_definition?.type === 'node') {
				visit(nodes[value]);
			} else if (property_definition?.type === 'text') {
				for (const range of [...(value.marks || []), ...(value.annotations || [])]) {
					visit(nodes[range.node_id]);
				}
			}
		}
		// Finally add the node to the result.
		// Deep clone, to make sure nothing of the original document is referenced.
		json.push(structuredClone(node));
	};
	// Start with the root node (document_id)
	visit(nodes[node_id]);
	return json;
}

/**
 * Extracts the normalized range from a text or node selection.
 * Returns start and end offsets in document order (start <= end), regardless of selection direction.
 * Returns null if selection is null, undefined, or a property selection.
 */
export function get_selection_range(selection?: Selection | null): SelectionRange | null {
	if (selection && selection.type !== 'property') {
		return {
			start_offset: Math.min(selection.anchor_offset, selection.focus_offset),
			end_offset: Math.max(selection.anchor_offset, selection.focus_offset)
		};
	} else {
		return null;
	}
}

export function is_selection_collapsed(selection?: Selection | null): boolean {
	if (selection && selection.type !== 'property') {
		return selection.anchor_offset === selection.focus_offset;
	} else {
		return false;
	}
}

/**
 * Adjust ranges (marks or annotations) after deleting a sequence range.
 *
 * Works for both annotated text (character offsets) and annotated node arrays
 * (node offsets).
 */
export function adjust_ranges_for_deletion(
	ranges: Array<Attachment>,
	start: number,
	end: number
): { ranges: Array<Attachment>; removed_node_ids: string[] } {
	const removed_node_ids: string[] = [];
	const deletion_length = end - start;

	const next_ranges = ranges
		.map((range) => {
			if (range.end_offset <= start) return range;

			let start_offset = range.start_offset;
			if (range.start_offset >= end) {
				start_offset -= deletion_length;
			} else if (range.start_offset > start) {
				start_offset = start;
			}

			let end_offset = range.end_offset;
			if (range.end_offset >= end) {
				end_offset -= deletion_length;
			} else if (range.end_offset > start) {
				end_offset = start;
			}

			if (start_offset >= end_offset) {
				removed_node_ids.push(range.node_id);
				return null;
			}

			return { start_offset, end_offset, node_id: range.node_id };
		})
		.filter((range): range is Attachment => range !== null);

	return { ranges: next_ranges, removed_node_ids };
}

/**
 * Adjust ranges (marks or annotations) after inserting into a sequence.
 *
 * Insertion inside a range extends it. Insertion exactly at either edge
 * stays outside the range.
 */
export function adjust_ranges_for_insertion(
	ranges: Array<Attachment>,
	offset: number,
	length: number
): Array<Attachment> {
	if (length === 0) return ranges;

	return ranges.map((range) => {
		if (range.end_offset <= offset) return range;

		if (range.start_offset < offset) {
			return {
				start_offset: range.start_offset,
				end_offset: range.end_offset + length,
				node_id: range.node_id
			};
		}

		return {
			start_offset: range.start_offset + length,
			end_offset: range.end_offset + length,
			node_id: range.node_id
		};
	});
}

/**
 * Check whether ranges are non-empty and mutually exclusive.
 */
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
 * Calculates abstract fragment ranges from a length and marks.
 */
export function calculate_fragment_ranges(
	length: number,
	marks: Array<Mark>,
	selection_highlight_range?: SelectionRange | null
): Array<FragmentRange> {
	const fragments: Array<FragmentRange> = [];
	let last_index = 0;

	// Merge marks with selection highlight and sort by start offset
	const ranges = [...marks, ...(selection_highlight_range ? [selection_highlight_range] : [])].sort(
		(a, b) => a.start_offset - b.start_offset
	);

	for (const range of ranges) {
		// Add content before this range
		if (range.start_offset > last_index) {
			fragments.push({
				type: 'content',
				start_offset: last_index,
				end_offset: range.start_offset
			});
		}

		if ('node_id' in range) {
			const mark = range as Mark;
			const mark_index = (mark as Mark & { mark_index?: number }).mark_index ?? marks.indexOf(mark);
			fragments.push({
				type: 'mark',
				start_offset: mark.start_offset,
				end_offset: mark.end_offset,
				node_id: mark.node_id,
				mark_index
			});
		} else {
			fragments.push({
				type: 'selection_highlight',
				start_offset: range.start_offset,
				end_offset: range.end_offset
			});
		}

		last_index = range.end_offset;
	}

	// Add any remaining content
	if (last_index < length) {
		fragments.push({
			type: 'content',
			start_offset: last_index,
			end_offset: length
		});
	}

	return fragments;
}
