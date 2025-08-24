/**
 * Get the actual character length (accounting for multi-byte characters)
 * @param {string} str
 * @returns {number}
 */
export function get_char_length(str) {
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  return [...segmenter.segment(str)].length;
}

/**
 * Slice string by character positions (accounting for multi-byte characters)
 * @param {string} str
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
export function char_slice(str, start, end = undefined) {
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const segments = [...segmenter.segment(str)];
  return segments.slice(start, end).map(s => s.segment).join('');
}

/**
 * Convert UTF-16 code unit offset to grapheme cluster offset within a string
 * @param {string} str
 * @param {number} utf16_offset
 * @returns {number}
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
 * @param {string} str
 * @param {number} char_offset
 * @returns {number}
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

// split_annotated_string(["Hello world", [[6,11, "strong"]]], 8)
// =>
// [
//   ["Hello wo", [[6,8, "strong"]]]
//   ["rld", [[0,3, "strong"]]]
// ]
export function split_annotated_string(text_with_annotations, at_position) {
  const [text, annotations] = text_with_annotations;

  // Split the text using character-aware slicing
  const left_text = char_slice(text, 0, at_position);
  const right_text = char_slice(text, at_position);

  const left_annotations = [];
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


// join_annotated_string(["Hello wo", [[6,8, "strong"]]], ["rld", [[0,3, "strong"]]])
// => ["Hello world", [[6,11, "strong"]]]
export function join_annotated_string(first_text, second_text) {
  const [first_text_content, first_annotations] = first_text;
  const [second_text_content, second_annotations] = second_text;

  // Join the text content
  const joined_text = first_text_content + second_text_content;

  // Start with all annotations from the first text (unchanged)
  const joined_annotations = [...first_annotations];

  // Add annotations from the second text, shifting their offsets
  const offset = get_char_length(first_text_content);
  for (const [start, end, type, data] of second_annotations) {
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

export function snake_to_pascal(str) {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
