import { customAlphabet } from "nanoid";

const _nanoid = customAlphabet(
  "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz",
  23
);

// A Svedit ID (svid) is a nanoid of length 23 with no numbers and no "_" or "-" to be used as HTML ids
export function svid() {
  return _nanoid();
}

export function is_valid_svid(id) {
  // TODO: Consider re-enabling strict id format checking
  // return /^[a-zA-Z]{23}$/i.test(id);
  return typeof id === 'string' && id.length > 0;
}



// split_annotated_string(["Hello world", [[6,11, "strong"]]], 8)
// =>
// [
//   ["Hello wo", [[6,8, "strong"]]]
//   ["rld", [[0,3, "strong"]]]
// ]
export function split_annotated_string(text_with_annotations, at_position) {
  const [text, annotations] = text_with_annotations;

  // Split the text
  const left_text = text.slice(0, at_position);
  const right_text = text.slice(at_position);

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
  const offset = first_text_content.length;
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


export function determine_node_array_orientation(doc, path_to_node_array) {
  // path_to_node_array minus the last element has the owner node of the node_rray
  const owner_node = doc.get(path_to_node_array.slice(0, -1));
  return doc.config?.node_types_with_horizontal_node_arrays?.includes(owner_node?.type) ? 'horizontal' : 'vertical';
}


