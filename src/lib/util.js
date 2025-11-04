/**
 * @import { Annotation, AnnotatedText } from './types.d.ts';
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
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const segments = [...segmenter.segment(str)];
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
 * split_annotated_text({text: "Hello world", annotations: [{start_offset: 6, end_offset: 11, node_id: "strong"}]}, 8)
 * // Returns:
 * // [
 * //   {text: "Hello wo", annotations: [{start_offset: 6, end_offset: 8, node_id: "strong"}]},
 * //   {text: "rld", annotations: [{start_offset: 0, end_offset: 3, node_id: "strong"}]}
 * // ]
 */
export function split_annotated_text(text_with_annotations, at_position) {
  const {text, annotations} = text_with_annotations;

  // Split the text using character-aware slicing
  const left_text = char_slice(text, 0, at_position);
  const right_text = char_slice(text, at_position);

  /** @type {Array<Annotation>} */
  const left_annotations = [];
  /** @type {Array<Annotation>} */
  const right_annotations = [];

  // Process each annotation
  for (const {start_offset, end_offset, node_id} of annotations) {
    if (end_offset <= at_position) {
      // Annotation is entirely in the left part
      left_annotations.push({start_offset, end_offset, node_id});
    } else if (start_offset >= at_position) {
      // Annotation is entirely in the right part - shift offsets
      right_annotations.push({start_offset: start_offset - at_position, end_offset: end_offset - at_position, node_id});
    } else {
      // Annotation spans the split point - split it
      left_annotations.push({start_offset, end_offset: at_position, node_id});
      right_annotations.push({start_offset: 0, end_offset: end_offset - at_position, node_id});
    }
  }

  return [
    {text: left_text, annotations: left_annotations},
    {text: right_text, annotations: right_annotations}
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
 * join_annotated_text({text: "Hello wo", annotations: [{start_offset: 6, end_offset: 8, node_id: "strong"}]}, {text: "rld", annotations: [{start_offset: 0, end_offset: 3, node_id: "strong"}]})
 * // Returns: {text: "Hello world", annotations: [{start_offset: 6, end_offset: 11, node_id: "strong"}]}
 */
export function join_annotated_text(first_text, second_text) {
  const {text: first_text_content, annotations: first_annotations} = first_text;
  const {text: second_text_content, annotations: second_annotations} = second_text;

  // Join the text content
  const joined_text = first_text_content + second_text_content;

  // Start with all annotations from the first text (unchanged)
  /** @type {Array<Annotation>} */
  const joined_annotations = [...first_annotations];

  // Add annotations from the second text, shifting their offsets
  const offset = get_char_length(first_text_content);
  for (const {start_offset, end_offset, node_id} of second_annotations) {
    /** @type {Annotation} */
    const shifted_annotation = {start_offset: start_offset + offset, end_offset: end_offset + offset, node_id};

    // Check if this annotation can be merged with the last annotation from first text
    const last_annotation = joined_annotations[joined_annotations.length - 1];
    if (last_annotation &&
        last_annotation.end_offset === shifted_annotation.start_offset && // annotations are adjacent
        last_annotation.node_id === shifted_annotation.node_id) { // same node_id
      // Merge by extending the end position of the last annotation
      last_annotation.end_offset = shifted_annotation.end_offset;
    } else {
      // Add as separate annotation
      joined_annotations.push(shifted_annotation);
    }
  }

  return {text: joined_text, annotations: joined_annotations};
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
        for (const v of value) {
          if (typeof v === 'string') {
            visit(nodes[v]);
          }
        }
      } else if (property_definition?.type === 'node') {
        visit(nodes[value]);
      } else if (property_definition?.type === 'annotated_text') {
        for (const annotation of value.annotations) {
          visit(nodes[annotation.node_id]);
        }
      }
    }
    // Finally add the node to the result.
    // Deep clone, to make sure nothing of the original document is referenced.
    json.push(structuredClone(node));
  }
  // Start with the root node (document_id)
  visit(nodes[node_id]);
  return json;
}

export function get_selection_range(selection) {
	if (selection && selection.type !== 'property') {
		const start = Math.min(selection.anchor_offset, selection.focus_offset);
		const end = Math.max(selection.anchor_offset, selection.focus_offset);
		return {
			start,
			end,
			length: end - start
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
