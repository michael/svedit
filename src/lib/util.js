/**
 * @import { Annotation } from './types.d.ts';
 */

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
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  return [...segmenter.segment(str)].length;
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
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const segments = [...segmenter.segment(str)];
  return segments.slice(start, end).map(s => s.segment).join('');
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
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const segments = [...segmenter.segment(str)];
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
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const segments = [...segmenter.segment(str)];
  let utf16_offset = 0;

  for (let i = 0; i < Math.min(char_offset, segments.length); i++) {
    utf16_offset += segments[i].segment.length;
  }

  return utf16_offset;
}

/**
 * Splits an annotated string at the specified character position.
 *
 * Annotations that span the split point will be divided appropriately,
 * with offsets adjusted for each resulting part.
 *
 * @param {[string, Array<Annotation>]} text_with_annotations - Tuple of [text, annotations] where annotations follow the Annotation type: [start, end, type, data?]
 * @param {number} at_position - Character position where to split (0-based)
 * @returns {[[string, Array<Annotation>], [string, Array<Annotation>]]} Tuple of [left_part, right_part] where each part is [text, annotations]
 *
 * @example
 * split_annotated_string(["Hello world", [[6,11, "strong"]]], 8)
 * // Returns:
 * // [
 * //   ["Hello wo", [[6,8, "strong"]]]
 * //   ["rld", [[0,3, "strong"]]]
 * // ]
 */
export function split_annotated_string(text_with_annotations, at_position) {
  const [text, annotations] = text_with_annotations;

  // Split the text using character-aware slicing
  const left_text = char_slice(text, 0, at_position);
  const right_text = char_slice(text, at_position);

  /** @type {Array<Annotation>} */
  const left_annotations = [];
  /** @type {Array<Annotation>} */
  const right_annotations = [];

  // Process each annotation
  for (const [start, end, type, data] of annotations) {
    if (end <= at_position) {
      // Annotation is entirely in the left part
      left_annotations.push([start, end, type, data]);
    } else if (start >= at_position) {
      // Annotation is entirely in the right part - shift offsets
      right_annotations.push([start - at_position, end - at_position, type, data]);
    } else {
      // Annotation spans the split point - split it
      left_annotations.push([start, at_position, type, data]);
      right_annotations.push([0, end - at_position, type, data]);
    }
  }

  return [
    [left_text, left_annotations],
    [right_text, right_annotations]
  ];
}


/**
 * Joins two annotated strings into a single annotated string.
 *
 * Annotations from the second text will have their offsets shifted by the length
 * of the first text. Adjacent annotations of the same type and data will be merged.
 *
 * @param {[string, Array<Annotation>]} first_text - First annotated string tuple where annotations follow the Annotation type: [start, end, type, data?]
 * @param {[string, Array<Annotation>]} second_text - Second annotated string tuple where annotations follow the Annotation type: [start, end, type, data?]
 * @returns {[string, Array<Annotation>]} Combined annotated string tuple [text, annotations]
 *
 * @example
 * join_annotated_string(["Hello wo", [[6,8, "strong"]]], ["rld", [[0,3, "strong"]]])
 * // Returns: ["Hello world", [[6,11, "strong"]]]
 */
export function join_annotated_string(first_text, second_text) {
  const [first_text_content, first_annotations] = first_text;
  const [second_text_content, second_annotations] = second_text;

  // Join the text content
  const joined_text = first_text_content + second_text_content;

  // Start with all annotations from the first text (unchanged)
  /** @type {Array<Annotation>} */
  const joined_annotations = [...first_annotations];

  // Add annotations from the second text, shifting their offsets
  const offset = get_char_length(first_text_content);
  for (const [start, end, type, data] of second_annotations) {
    /** @type {Annotation} */
    const shifted_annotation = [start + offset, end + offset, type, data];

    // Check if this annotation can be merged with the last annotation from first text
    const last_annotation = joined_annotations[joined_annotations.length - 1];
    if (last_annotation &&
        last_annotation[1] === shifted_annotation[0] && // annotations are adjacent
        last_annotation[2] === shifted_annotation[2] && // same type
        JSON.stringify(last_annotation[3]) === JSON.stringify(shifted_annotation[3])) { // same data
      // Merge by extending the end position of the last annotation
      last_annotation[1] = shifted_annotation[1];
    } else {
      // Add as separate annotation
      joined_annotations.push(shifted_annotation);
    }
  }

  return [joined_text, joined_annotations];
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
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
