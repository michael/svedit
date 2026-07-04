/**
 * @import { Annotation, AnnotatedText, SelectionRange, Selection } from './types.d.ts';
 */

const SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Detect if the virtual keyboard is likely visible.
 *
 * This is a heuristic based on the visual viewport becoming smaller than the
 * layout viewport.
 *
 * @returns {boolean} true if the virtual keyboard is likely active, false otherwise
 */
export function is_virtual_keyboard_active() {
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
 *
 * @returns {boolean} true if mobile browser, false otherwise
 */
export function is_mobile_browser() {
	if (typeof navigator === 'undefined') {
		return false;
	}

	const user_agent = navigator.userAgent;
	return /iPhone|iPad|iPod|Android|Mobile/i.test(user_agent);
}

// ‼️‼️‼️‼️‼️‼️ UNUSED UTILITY BELOW ‼️‼️‼️‼️‼️‼️
/**
 * Detect if the current browser is Chrome on desktop
 * @returns {boolean} true if Chrome desktop browser, false otherwise
 */
export function is_chrome_desktop_browser() {
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
 * @param {string} str - The string to measure
 * @returns {number} The number of visual characters (grapheme clusters)
 *
 * @example
 * get_char_length('Hello') // Returns: 5
 * get_char_length('a😀b') // Returns: 3 (not 4)
 * get_char_length('👋🏽') // Returns: 1 (not 4 - skin tone modifier treated as single char)
 */
export function get_char_length(str) {
	return [...SEGMENTER.segment(str)].length;
}

// ‼️‼️‼️‼️‼️‼️ UNUSED UTILITY BELOW ‼️‼️‼️‼️‼️‼️
/**
 * Get a single character at the specified position (accounting for multi-byte characters)
 *
 * Uses Intl.Segmenter to access grapheme clusters rather than UTF-16 code units,
 * ensuring emojis and other complex Unicode sequences are treated as single characters.
 *
 * @param {string} str - The string to access
 * @param {number} index - Character position (0-based)
 * @returns {string} The character at the specified position, or empty string if index is out of bounds
 *
 * @example
 * get_char_at('Hello', 1) // Returns: 'e'
 * get_char_at('a😀b', 1) // Returns: '😀' (full emoji)
 * get_char_at('👋🏽', 0) // Returns: '👋🏽' (skin tone modifier included)
 */
export function get_char_at(str, index) {
	const segments = [...SEGMENTER.segment(str)];
	return segments[index].segment;
}

/**
 * Slice string by character positions (accounting for multi-byte characters)
 *
 * Uses Intl.Segmenter to slice by grapheme clusters rather than UTF-16 code units,
 * ensuring emojis and other complex Unicode sequences remain intact.
 *
 * @param {string} str - The string to slice
 * @param {number} start - Starting character position (inclusive)
 * @param {number} [end] - Ending character position (exclusive). If undefined, slices to end
 * @returns {string} The sliced string with complete characters
 *
 * @example
 * char_slice('Hello 😀 World', 6, 8) // Returns: '😀 ' (emoji stays intact)
 * char_slice('a👋🏽b', 1, 2) // Returns: '👋🏽' (skin tone modifier included)
 */
export function char_slice(str, start, end = undefined) {
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
 * @param {string} str - The string to convert offsets within
 * @param {number} utf16_offset - The UTF-16 code unit offset from DOM
 * @returns {number} The corresponding grapheme cluster offset
 *
 * @example
 * // For string "a😀b" where 😀 uses 2 UTF-16 code units
 * utf16_to_char_offset("a😀b", 3) // Returns: 2 (position after emoji)
 */
export function utf16_to_char_offset(str, utf16_offset) {
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
 * @param {string} str - The string to convert offsets within
 * @param {number} char_offset - The grapheme cluster offset
 * @returns {number} The corresponding UTF-16 code unit offset for DOM operations
 *
 * @example
 * // For string "a😀b" where 😀 uses 2 UTF-16 code units
 * char_to_utf16_offset("a😀b", 2) // Returns: 3 (UTF-16 position after emoji)
 */
export function char_to_utf16_offset(str, char_offset) {
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
 * Annotations that span the split point will be divided appropriately,
 * with offsets adjusted for each resulting part.
 *
 * @param {AnnotatedText} text_with_annotations - Annotated text object
 * @param {number} at_position - Character position where to split (0-based)
 * @returns {[AnnotatedText, AnnotatedText]} Tuple of [left_part, right_part]
 *
 * @example
 * split_text({content: "Hello world", annotations: [{start_offset: 6, end_offset: 11, node_id: "strong"}]}, 8)
 * // Returns:
 * // [
 * //   {content: "Hello wo", annotations: [{start_offset: 6, end_offset: 8, node_id: "strong"}]},
 * //   {content: "rld", annotations: [{start_offset: 0, end_offset: 3, node_id: "strong"}]}
 * // ]
 */
export function split_text(text_with_annotations, at_position) {
	const { content, annotations } = text_with_annotations;

	// Split the text using character-aware slicing
	const left_text = char_slice(content, 0, at_position);
	const right_text = char_slice(content, at_position);

	/** @type {Array<Annotation>} */
	const left_annotations = [];
	/** @type {Array<Annotation>} */
	const right_annotations = [];

	// Process each annotation
	for (const { start_offset, end_offset, node_id } of annotations) {
		if (end_offset <= at_position) {
			// Annotation is entirely in the left part
			left_annotations.push({ start_offset, end_offset, node_id });
		} else if (start_offset >= at_position) {
			// Annotation is entirely in the right part - shift offsets
			right_annotations.push({
				start_offset: start_offset - at_position,
				end_offset: end_offset - at_position,
				node_id
			});
		} else {
			// Annotation spans the split point - split it
			left_annotations.push({ start_offset, end_offset: at_position, node_id });
			right_annotations.push({ start_offset: 0, end_offset: end_offset - at_position, node_id });
		}
	}

	return [
		{ content: left_text, annotations: left_annotations },
		{ content: right_text, annotations: right_annotations }
	];
}

/**
 * Joins two annotated texts into a single annotated text.
 *
 * Annotations from the second text will have their offsets shifted by the length
 * of the first text. Adjacent annotations of the same type and data will be merged.
 *
 * @param {AnnotatedText} first_text - First annotated text object
 * @param {AnnotatedText} second_text - Second annotated text object
 * @returns {AnnotatedText} Combined annotated text object
 *
 * @example
 * join_text({content: "Hello wo", annotations: [{start_offset: 6, end_offset: 8, node_id: "strong"}]}, {content: "rld", annotations: [{start_offset: 0, end_offset: 3, node_id: "strong"}]})
 * // Returns: {content: "Hello world", annotations: [{start_offset: 6, end_offset: 11, node_id: "strong"}]}
 */
export function join_text(first_text, second_text) {
	const { content: first_text_content, annotations: first_annotations } = first_text;
	const { content: second_text_content, annotations: second_annotations } = second_text;

	// Join the text content
	const joined_text = first_text_content + second_text_content;

	// Start with all annotations from the first text (unchanged)
	/** @type {Array<Annotation>} */
	const joined_annotations = [...first_annotations];

	// Add annotations from the second text, shifting their offsets
	const offset = get_char_length(first_text_content);
	for (const { start_offset, end_offset, node_id } of second_annotations) {
		/** @type {Annotation} */
		const shifted_annotation = {
			start_offset: start_offset + offset,
			end_offset: end_offset + offset,
			node_id
		};

		// Check if this annotation can be merged with the last annotation from first text
		const last_annotation = joined_annotations[joined_annotations.length - 1];
		if (
			last_annotation &&
			last_annotation.end_offset === shifted_annotation.start_offset && // annotations are adjacent
			last_annotation.node_id === shifted_annotation.node_id
		) {
			// same node_id
			// Merge by extending the end position of the last annotation
			last_annotation.end_offset = shifted_annotation.end_offset;
		} else {
			// Add as separate annotation
			joined_annotations.push(shifted_annotation);
		}
	}

	return { content: joined_text, annotations: joined_annotations };
}

/**
 * Convert snake_case string to PascalCase
 *
 * @param {string} str - The snake_case string to convert
 * @returns {string} The converted PascalCase string
 *
 * @example
 * snake_to_pascal('list_item') // Returns: 'ListItem'
 */
export function snake_to_pascal(str) {
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
 *
 * @param {string} segment
 * @returns {boolean}
 */
export function is_path_string_segment_valid(segment) {
	return (
		typeof segment === 'string' &&
		PATH_STRING_SEGMENT_RE.test(segment) &&
		!segment.includes(PATH_SEPARATOR)
	);
}

/**
 * Assert that a string can be used as a Svedit path segment.
 *
 * @param {string} segment
 * @param {string} [label]
 * @returns {void}
 */
export function assert_path_string_segment(segment, label = 'Path segment') {
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
 * @param {Array<string | number>} path
 * @returns {string}
 *
 * @example
 * serialize_path(['page_1', 'body', 0, 'items']) // Returns: 'page_1__body__0__items'
 */
export function serialize_path(path) {
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
 * @param {string} serialized_path
 * @returns {Array<string | number>}
 *
 * @example
 * deserialize_path('page_1__body__0__items') // Returns: ['page_1', 'body', 0, 'items']
 */
export function deserialize_path(serialized_path) {
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
 *
 * @param {Array<string | number>} a
 * @param {Array<string | number>} b
 * @returns {boolean}
 */
export function paths_equal(a, b) {
	if (a.length !== b.length) return false;
	return a.every((segment, index) => segment === b[index]);
}

export function traverse(node_id, schema, nodes) {
	const json = [];
	const visited = {};
	const visit = (node) => {
		if (!node || visited[node.id]) {
			return;
		}
		visited[node.id] = true;
		for (const [property_name, value] of Object.entries(node)) {
			const property_definition = schema[node.type].properties[property_name];

			if (property_definition?.type === 'node_array') {
				const node_ids = value?.nodes || [];
				const annotations = value?.annotations || [];

				for (const v of node_ids) {
					if (typeof v === 'string') {
						visit(nodes[v]);
					}
				}

				for (const annotation of annotations) {
					visit(nodes[annotation.node_id]);
				}
			} else if (property_definition?.type === 'node') {
				visit(nodes[value]);
			} else if (property_definition?.type === 'text') {
				for (const annotation of value.annotations) {
					visit(nodes[annotation.node_id]);
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
 * @param {Selection} [selection] - The selection to extract the range from
 * @returns {SelectionRange | null} The normalized selection range, or null if selection is null, undefined, or a property selection
 */
export function get_selection_range(selection) {
	if (selection && selection.type !== 'property') {
		return {
			start_offset: Math.min(selection.anchor_offset, selection.focus_offset),
			end_offset: Math.max(selection.anchor_offset, selection.focus_offset)
		};
	} else {
		return null;
	}
}

export function is_selection_collapsed(selection) {
	if (selection && selection.type !== 'property') {
		return selection.anchor_offset === selection.focus_offset;
	} else {
		return false;
	}
}

/**
 * Adjust annotation ranges after deleting a sequence range.
 *
 * Works for both annotated text (character offsets) and annotated node arrays
 * (node offsets).
 *
 * @param {Array<import('./types.d.ts').Annotation>} annotations
 * @param {number} start
 * @param {number} end
 * @returns {{annotations: Array<import('./types.d.ts').Annotation>, removed_node_ids: string[]}}
 */
export function delete_range_from_annotations(annotations, start, end) {
	const removed_node_ids = [];
	const deletion_length = end - start;

	const next_annotations = annotations
		.map((annotation) => {
			if (annotation.end_offset <= start) return annotation;

			let start_offset = annotation.start_offset;
			if (annotation.start_offset >= end) {
				start_offset -= deletion_length;
			} else if (annotation.start_offset > start) {
				start_offset = start;
			}

			let end_offset = annotation.end_offset;
			if (annotation.end_offset >= end) {
				end_offset -= deletion_length;
			} else if (annotation.end_offset > start) {
				end_offset = start;
			}

			if (start_offset >= end_offset) {
				removed_node_ids.push(annotation.node_id);
				return null;
			}

			return { start_offset, end_offset, node_id: annotation.node_id };
		})
		.filter(Boolean);

	return { annotations: next_annotations, removed_node_ids };
}

/**
 * Adjust annotation ranges after inserting into a sequence.
 *
 * Insertion inside an annotation extends it. Insertion exactly at either edge
 * stays outside the annotation.
 *
 * @param {Array<import('./types.d.ts').Annotation>} annotations
 * @param {number} offset
 * @param {number} length
 * @returns {Array<import('./types.d.ts').Annotation>}
 */
export function insert_range_into_annotations(annotations, offset, length) {
	if (length === 0) return annotations;

	return annotations.map((annotation) => {
		if (annotation.end_offset <= offset) return annotation;

		if (annotation.start_offset < offset) {
			return {
				start_offset: annotation.start_offset,
				end_offset: annotation.end_offset + length,
				node_id: annotation.node_id
			};
		}

		return {
			start_offset: annotation.start_offset + length,
			end_offset: annotation.end_offset + length,
			node_id: annotation.node_id
		};
	});
}

/**
 * Check whether annotation ranges are non-empty and mutually exclusive.
 *
 * @param {Array<import('./types.d.ts').Annotation>} annotations
 * @param {number} [length]
 * @returns {boolean}
 */
export function are_annotation_ranges_exclusive(annotations, length = Infinity) {
	const sorted = [...annotations].sort(
		(a, b) => a.start_offset - b.start_offset || a.end_offset - b.end_offset
	);

	return sorted.every(
		(annotation, index) =>
			Number.isInteger(annotation.start_offset) &&
			Number.isInteger(annotation.end_offset) &&
			annotation.start_offset >= 0 &&
			annotation.start_offset < annotation.end_offset &&
			annotation.end_offset <= length &&
			(index === 0 || annotation.start_offset >= sorted[index - 1].end_offset)
	);
}

/**
 * Calculates abstract fragment ranges from a length and annotations.
 *
 * @param {number} length - Length of the sequence (e.g. text length or array length)
 * @param {Array<import('./types.d.ts').Annotation>} annotations - Array of annotations
 * @param {import('./types.d.ts').SelectionRange} [selection_highlight_range] - Optional selection highlight range
 * @returns {Array<{type: 'content' | 'annotation' | 'selection_highlight', start_offset: number, end_offset: number, annotation_index?: number, node_id?: string}>}
 */
export function calculate_fragment_ranges(length, annotations, selection_highlight_range) {
	/** @type {Array<{type: 'content' | 'annotation' | 'selection_highlight', start_offset: number, end_offset: number, annotation_index?: number, node_id?: string}>} */
	const fragments = [];
	let last_index = 0;

	// Merge annotations with selection highlight and sort by start offset
	const ranges = [
		...annotations,
		...(selection_highlight_range ? [selection_highlight_range] : [])
	].sort((a, b) => a.start_offset - b.start_offset);

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
			const annotation = /** @type {import('./types.d.ts').Annotation} */ (range);
			const annotation_index =
				/** @type {import('./types.d.ts').Annotation & { annotation_index?: number }} */ (
					annotation
				).annotation_index ?? annotations.indexOf(annotation);
			fragments.push({
				type: 'annotation',
				start_offset: annotation.start_offset,
				end_offset: annotation.end_offset,
				node_id: annotation.node_id,
				annotation_index
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
