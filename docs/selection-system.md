# Selection System Guide

Understanding and working with Svedit's selection system.

## Overview

Svedit's selection system maps between the browser's DOM selection and an internal selection model. This allows you to programmatically control the cursor and selection state while maintaining a clean separation between the document model and the UI.

## Selection Types

Svedit supports three types of selections:

### 1. Text Selection

Selects a range of characters within an `annotated_text` property.

```js
{
  type: 'text',
  path: ['page_1', 'body', 0, 'content'],
  anchor_offset: 5,
  focus_offset: 10
}
```

- **`path`**: Path to the text property
- **`anchor_offset`**: Character offset where selection starts
- **`focus_offset`**: Character offset where selection ends

**Collapsed cursor** (no selection):
```js
{
  type: 'text',
  path: ['page_1', 'body', 0, 'content'],
  anchor_offset: 5,
  focus_offset: 5
}
```

**Backwards selection** (selecting from right to left):
```js
{
  type: 'text',
  path: ['page_1', 'body', 0, 'content'],
  anchor_offset: 10,  // Ends here
  focus_offset: 5     // Starts here
}
```

### 2. Node Selection

Selects a range of nodes within a `node_array` property.

```js
{
  type: 'node',
  path: ['page_1', 'body'],
  anchor_offset: 1,
  focus_offset: 3
}
```

- **`path`**: Path to the node array
- **`anchor_offset`**: Index where selection starts
- **`focus_offset`**: Index where selection ends (exclusive)

This example selects nodes at indices 1 and 2 (the 2nd and 3rd nodes).

**Single node selected**:
```js
{
  type: 'node',
  path: ['page_1', 'body'],
  anchor_offset: 2,
  focus_offset: 3
}
```

**Collapsed cursor** (between nodes):
```js
{
  type: 'node',
  path: ['page_1', 'body'],
  anchor_offset: 2,
  focus_offset: 2
}
```

### 3. Property Selection

Selects a specific property of a node (used for non-text, non-array properties).

```js
{
  type: 'property',
  path: ['page_1', 'body', 3, 'image']
}
```

- **`path`**: Path to the property

This is useful for selecting things like image URLs, checkboxes, or other atomic properties that don't have ranges.

## Reading the Selection

### Get Current Selection

```js
const selection = doc.selection;

if (!selection) {
  console.log('No selection');
} else if (selection.type === 'text') {
  console.log('Text selected at:', selection.path);
} else if (selection.type === 'node') {
  console.log('Nodes selected at:', selection.path);
} else if (selection.type === 'property') {
  console.log('Property selected at:', selection.path);
}
```

### Check Selection State

```js
function is_collapsed(selection) {
  if (selection.type === 'text' || selection.type === 'node') {
    return selection.anchor_offset === selection.focus_offset;
  }
  return true; // Property selections are always "collapsed"
}

function get_selection_range(selection) {
  if (selection.type === 'text' || selection.type === 'node') {
    const start = Math.min(selection.anchor_offset, selection.focus_offset);
    const end = Math.max(selection.anchor_offset, selection.focus_offset);
    return { start, end };
  }
  return null;
}

function is_backwards(selection) {
  if (selection.type === 'text' || selection.type === 'node') {
    return selection.anchor_offset > selection.focus_offset;
  }
  return false;
}
```

### Extract Selected Content

```js
function get_selected_text(doc) {
  const sel = doc.selection;
  if (sel.type !== 'text') return '';
  
  const [text, _] = doc.get(sel.path);
  const start = Math.min(sel.anchor_offset, sel.focus_offset);
  const end = Math.max(sel.anchor_offset, sel.focus_offset);
  
  return text.slice(start, end);
}

function get_selected_nodes(doc) {
  const sel = doc.selection;
  if (sel.type !== 'node') return [];
  
  const nodes = doc.get(sel.path);
  const start = Math.min(sel.anchor_offset, sel.focus_offset);
  const end = Math.max(sel.anchor_offset, sel.focus_offset);
  
  return nodes.slice(start, end);
}
```

## Setting the Selection

### Set Text Selection

```js
// Select characters 5-10 in first paragraph
doc.selection = {
  type: 'text',
  path: ['page_1', 'body', 0, 'content'],
  anchor_offset: 5,
  focus_offset: 10
};

// Place cursor at start of text
doc.selection = {
  type: 'text',
  path: ['page_1', 'body', 0, 'content'],
  anchor_offset: 0,
  focus_offset: 0
};

// Select all text
const [text, _] = doc.get(['page_1', 'body', 0, 'content']);
doc.selection = {
  type: 'text',
  path: ['page_1', 'body', 0, 'content'],
  anchor_offset: 0,
  focus_offset: text.length
};
```

### Set Node Selection

```js
// Select first two nodes
doc.selection = {
  type: 'node',
  path: ['page_1', 'body'],
  anchor_offset: 0,
  focus_offset: 2
};

// Select single node
doc.selection = {
  type: 'node',
  path: ['page_1', 'body'],
  anchor_offset: 2,
  focus_offset: 3
};
```

### Set Property Selection

```js
// Select an image property
doc.selection = {
  type: 'property',
  path: ['page_1', 'body', 3, 'src']
};
```

### Clear Selection

```js
doc.selection = null;
```

## Selection Utilities

### Navigate to Next/Previous Node

```js
function select_next_node(doc) {
  const sel = doc.selection;
  if (!sel || sel.type !== 'node') return;
  
  const nodes = doc.get(sel.path);
  const current = Math.max(sel.anchor_offset, sel.focus_offset);
  
  if (current < nodes.length) {
    doc.selection = {
      type: 'node',
      path: sel.path,
      anchor_offset: current,
      focus_offset: current + 1
    };
  }
}

function select_previous_node(doc) {
  const sel = doc.selection;
  if (!sel || sel.type !== 'node') return;
  
  const current = Math.min(sel.anchor_offset, sel.focus_offset);
  
  if (current > 0) {
    doc.selection = {
      type: 'node',
      path: sel.path,
      anchor_offset: current - 1,
      focus_offset: current
    };
  }
}
```

### Select All in Node Array

```js
function select_all_nodes(doc, array_path) {
  const nodes = doc.get(array_path);
  doc.selection = {
    type: 'node',
    path: array_path,
    anchor_offset: 0,
    focus_offset: nodes.length
  };
}
```

### Move Text Cursor

```js
function move_cursor_to_start(doc, text_path) {
  doc.selection = {
    type: 'text',
    path: text_path,
    anchor_offset: 0,
    focus_offset: 0
  };
}

function move_cursor_to_end(doc, text_path) {
  const [text, _] = doc.get(text_path);
  doc.selection = {
    type: 'text',
    path: text_path,
    anchor_offset: text.length,
    focus_offset: text.length
  };
}

function move_cursor_forward(doc, steps = 1) {
  const sel = doc.selection;
  if (!sel || sel.type !== 'text') return;
  
  const [text, _] = doc.get(sel.path);
  const new_pos = Math.min(
    sel.focus_offset + steps,
    text.length
  );
  
  doc.selection = {
    type: 'text',
    path: sel.path,
    anchor_offset: new_pos,
    focus_offset: new_pos
  };
}

function move_cursor_backward(doc, steps = 1) {
  const sel = doc.selection;
  if (!sel || sel.type !== 'text') return;
  
  const new_pos = Math.max(sel.focus_offset - steps, 0);
  
  doc.selection = {
    type: 'text',
    path: sel.path,
    anchor_offset: new_pos,
    focus_offset: new_pos
  };
}
```

### Extend Selection

```js
function extend_selection_forward(doc, steps = 1) {
  const sel = doc.selection;
  if (!sel || sel.type !== 'text') return;
  
  const [text, _] = doc.get(sel.path);
  const new_focus = Math.min(
    sel.focus_offset + steps,
    text.length
  );
  
  doc.selection = {
    type: 'text',
    path: sel.path,
    anchor_offset: sel.anchor_offset,
    focus_offset: new_focus
  };
}

function extend_selection_backward(doc, steps = 1) {
  const sel = doc.selection;
  if (!sel || sel.type !== 'text') return;
  
  const new_focus = Math.max(sel.focus_offset - steps, 0);
  
  doc.selection = {
    type: 'text',
    path: sel.path,
    anchor_offset: sel.anchor_offset,
    focus_offset: new_focus
  };
}
```

## Working with Annotations

### Get Annotations at Cursor

```js
function get_annotations_at_cursor(doc) {
  const sel = doc.selection;
  if (!sel || sel.type !== 'text') return [];
  
  const [text, annotations] = doc.get(sel.path);
  const offset = sel.focus_offset;
  
  return annotations.filter(ann => 
    ann.start <= offset && ann.end >= offset
  );
}
```

### Get Annotations in Range

```js
function get_annotations_in_range(doc, selection) {
  if (selection.type !== 'text') return [];
  
  const [text, annotations] = doc.get(selection.path);
  const start = Math.min(selection.anchor_offset, selection.focus_offset);
  const end = Math.max(selection.anchor_offset, selection.focus_offset);
  
  return annotations.filter(ann =>
    ann.start < end && ann.end > start
  );
}
```

### Check if Selection Has Annotation

```js
function selection_has_annotation(doc, annotation_type) {
  const sel = doc.selection;
  if (!sel || sel.type !== 'text') return false;
  
  const [text, annotations] = doc.get(sel.path);
  const start = Math.min(sel.anchor_offset, sel.focus_offset);
  const end = Math.max(sel.anchor_offset, sel.focus_offset);
  
  return annotations.some(ann =>
    ann.type === annotation_type &&
    ann.start <= start &&
    ann.end >= end
  );
}
```

## Selection Events

### Listen for Selection Changes

In a Svelte component:

```svelte
<script>
  let current_selection = $state(null);
  
  $effect(() => {
    current_selection = doc.selection;
    console.log('Selection changed:', current_selection);
  });
</script>
```

### Toolbar Based on Selection

```svelte
<script>
  let show_text_formatting = $derived(
    doc.selection?.type === 'text'
  );
  
  let show_node_actions = $derived(
    doc.selection?.type === 'node'
  );
  
  let selected_node = $derived(() => {
    const sel = doc.selection;
    if (sel?.type !== 'node') return null;
    
    const nodes = doc.get(sel.path);
    const index = sel.anchor_offset;
    return nodes[index];
  });
</script>

{#if show_text_formatting}
  <TextFormattingToolbar {doc} />
{:else if show_node_actions}
  <NodeActionsToolbar {doc} node={selected_node} />
{/if}
```

## Advanced Patterns

### Smart Enter Key Handler

```js
function handle_enter_key(doc) {
  const sel = doc.selection;
  if (!sel || sel.type !== 'text') return;
  
  const node_path = sel.path.slice(0, -1);
  const node = doc.get(node_path);
  const [text, annotations] = doc.get(sel.path);
  
  // Check if newlines are allowed
  const schema = doc.get_property_schema(node.type, 'content');
  if (schema.allow_newlines) {
    // Insert newline character
    const offset = sel.focus_offset;
    const new_text = text.slice(0, offset) + '\n' + text.slice(offset);
    
    const tr = doc.tr;
    tr.set(sel.path, [new_text, annotations]);
    doc.apply(tr);
    
    // Move cursor after newline
    doc.selection = {
      type: 'text',
      path: sel.path,
      anchor_offset: offset + 1,
      focus_offset: offset + 1
    };
  } else {
    // Create new paragraph
    break_text_node(doc);
  }
}
```

### Delete Selected Content

```js
function delete_selection(doc) {
  const sel = doc.selection;
  if (!sel) return;
  
  if (sel.type === 'text') {
    const [text, annotations] = doc.get(sel.path);
    const start = Math.min(sel.anchor_offset, sel.focus_offset);
    const end = Math.max(sel.anchor_offset, sel.focus_offset);
    
    if (start === end) return; // Nothing selected
    
    const new_text = text.slice(0, start) + text.slice(end);
    const new_annotations = annotations
      .map(ann => {
        if (ann.end <= start) return ann;
        if (ann.start >= end) {
          return { ...ann, start: ann.start - (end - start), end: ann.end - (end - start) };
        }
        if (ann.start < start && ann.end > end) {
          return { ...ann, end: ann.end - (end - start) };
        }
        return null;
      })
      .filter(ann => ann !== null);
    
    const tr = doc.tr;
    tr.set(sel.path, [new_text, new_annotations]);
    doc.apply(tr);
    
    doc.selection = {
      type: 'text',
      path: sel.path,
      anchor_offset: start,
      focus_offset: start
    };
  } else if (sel.type === 'node') {
    const nodes = doc.get(sel.path);
    const start = Math.min(sel.anchor_offset, sel.focus_offset);
    const end = Math.max(sel.anchor_offset, sel.focus_offset);
    
    const deleted_ids = nodes.slice(start, end);
    const updated_nodes = [...nodes.slice(0, start), ...nodes.slice(end)];
    
    const tr = doc.tr;
    tr.set(sel.path, updated_nodes);
    deleted_ids.forEach(id => tr.delete(id));
    doc.apply(tr);
    
    doc.selection = {
      type: 'node',
      path: sel.path,
      anchor_offset: start,
      focus_offset: start
    };
  }
}
```

### Find and Select Text

```js
function find_and_select(doc, search_text) {
  const nodes = doc.nodes;
  
  for (const [node_id, node] of Object.entries(nodes)) {
    for (const [prop_name, prop_value] of Object.entries(node)) {
      if (Array.isArray(prop_value) && prop_value.length === 2) {
        const [text, annotations] = prop_value;
        if (typeof text === 'string') {
          const index = text.indexOf(search_text);
          if (index !== -1) {
            // Found it! Build path and select
            const path = [node_id, prop_name];
            doc.selection = {
              type: 'text',
              path,
              anchor_offset: index,
              focus_offset: index + search_text.length
            };
            return true;
          }
        }
      }
    }
  }
  
  return false;
}
```

## contenteditable Integration

The `<Svedit>` component automatically syncs between DOM selection and the internal selection model:

- When you click or select in the editor, `doc.selection` updates
- When you programmatically change `doc.selection`, the DOM selection updates
- The mapping handles complex cases like backwards selections and multi-node ranges

### Manual DOM Selection Control

If you need to work with the DOM selection directly:

```js
function get_dom_selection() {
  return window.getSelection();
}

function set_dom_selection_range(element, start, end) {
  const range = document.createRange();
  const text_node = element.firstChild;
  
  range.setStart(text_node, start);
  range.setEnd(text_node, end);
  
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
```

But in most cases, you should work with `doc.selection` and let Svedit handle the DOM mapping.

## Best Practices

1. **Always use doc.selection** - Don't try to manage DOM selection manually
2. **Handle all selection types** - Check `selection.type` before using offsets
3. **Validate paths** - Ensure the path exists before setting selection
4. **Normalize ranges** - Use `Math.min/max` to handle backwards selections
5. **Update after changes** - Set appropriate selection after document modifications

## Common Pitfalls

### Setting Invalid Selection

```js
// ❌ Bad - path might not exist
doc.selection = {
  type: 'text',
  path: ['page_1', 'body', 999, 'content'],
  anchor_offset: 0,
  focus_offset: 0
};

// ✅ Good - validate first
const body = doc.get(['page_1', 'body']);
if (body && body.length > 0) {
  doc.selection = {
    type: 'text',
    path: ['page_1', 'body', 0, 'content'],
    anchor_offset: 0,
    focus_offset: 0
  };
}
```

### Forgetting to Handle Backwards Selection

```js
// ❌ Bad - assumes anchor < focus
const selected_text = text.slice(
  sel.anchor_offset,
  sel.focus_offset
);

// ✅ Good - handles both directions
const start = Math.min(sel.anchor_offset, sel.focus_offset);
const end = Math.max(sel.anchor_offset, sel.focus_offset);
const selected_text = text.slice(start, end);
```

## Next Steps

- Build [Custom Components](./custom-components.md) that work with selections
- Learn about the [Document API](./document-api.md)
- Review the [Getting Started Guide](./getting-started.md)
