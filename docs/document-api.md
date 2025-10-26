# Document API Reference

This guide covers the Document and Transaction APIs for reading and writing content.

## Document Class

The Document class is the central interface for managing content in Svedit.

### Creating a Document

```js
import { Document } from 'svedit';

const doc = new Document(
  document_schema,    // Your schema definition
  serialized_doc,     // Your document data
  { config: document_config }  // Configuration object
);
```

### Document Properties

**`doc.document_id`** - The ID of the root document node

**`doc.schema`** - The document schema

**`doc.config`** - The configuration object

**`doc.selection`** - Current selection (readable and writable)

**`doc.nodes`** - Map of all nodes in the document (reactive)

### Reading Data

#### Get a Node

```js
// Get a complete node
const page = doc.get(['page_1']);
// Returns: { id: 'page_1', type: 'page', body: [...], ... }

// Get a property value
const body = doc.get(['page_1', 'body']);
// Returns: ['paragraph_1', 'list_1', ...]

// Navigate deeper
const first_paragraph = doc.get(['page_1', 'body', 0]);
// Returns: { id: 'paragraph_1', type: 'paragraph', content: [...], ... }

// Get nested property
const content = doc.get(['page_1', 'body', 0, 'content']);
// Returns: ['Hello world', []]
```

#### Get Schema Info

```js
// Get node schema
const node_schema = doc.get_node_schema('paragraph');
// Returns: { kind: 'text', properties: {...} }

// Get property schema
const prop_schema = doc.get_property_schema('paragraph', 'content');
// Returns: { type: 'annotated_text', allow_newlines: true, ... }
```

#### Traverse the Document

```js
import { traverse } from 'svedit';

// Visit all nodes
traverse(doc, ['page_1'], (path, node) => {
  console.log('Node at', path, ':', node);
});
```

### Working with Selections

#### Get Current Selection

```js
const selection = doc.selection;

if (selection.type === 'text') {
  console.log('Text selected:', selection.path);
  console.log('From:', selection.anchor_offset);
  console.log('To:', selection.focus_offset);
}
```

#### Set Selection

```js
// Set a text selection
doc.selection = {
  type: 'text',
  path: ['page_1', 'body', 0, 'content'],
  anchor_offset: 0,
  focus_offset: 5
};

// Set a node selection
doc.selection = {
  type: 'node',
  path: ['page_1', 'body'],
  anchor_offset: 0,
  focus_offset: 2
};

// Set a property selection
doc.selection = {
  type: 'property',
  path: ['page_1', 'body', 3, 'image']
};
```

### Serialization

#### Serialize Document

```js
const serialized = doc.serialize();
// Returns array of nodes ready to save

// Save to backend
await fetch('/api/documents/page_1', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(serialized)
});
```

#### Load from Serialized Data

```js
// Load fresh document
const doc = new Document(schema, serialized_data, { config });

// Or update existing document
const new_doc = new Document(schema, new_serialized_data, { config });
```

## Transaction API

All document modifications must go through transactions for undo/redo support.

### Creating a Transaction

```js
const tr = doc.tr;
```

### Transaction Operations

#### Set Property Value

```js
const tr = doc.tr;
tr.set(['paragraph_1', 'content'], ['New text', []]);
doc.apply(tr);
```

#### Create Node

```js
const tr = doc.tr;
const new_node = {
  id: 'paragraph_2',
  type: 'paragraph',
  content: ['New paragraph', []]
};
tr.create(new_node);
doc.apply(tr);
```

#### Insert into Node Array

```js
const tr = doc.tr;

// Insert at specific position
tr.insert_at(['page_1', 'body'], 1, ['paragraph_2']);

// Append to end
const body = doc.get(['page_1', 'body']);
tr.set(['page_1', 'body'], [...body, 'paragraph_2']);

doc.apply(tr);
```

#### Delete Nodes

```js
const tr = doc.tr;

// Remove from array
const body = doc.get(['page_1', 'body']);
const updated_body = body.filter(id => id !== 'paragraph_1');
tr.set(['page_1', 'body'], updated_body);

// Delete the node itself
tr.delete('paragraph_1');

doc.apply(tr);
```

#### Update Annotated Text

```js
const tr = doc.tr;

// Update text content
tr.set(['paragraph_1', 'content'], [
  'Updated text with annotations',
  [
    { type: 'strong', start: 0, end: 7 },
    { type: 'emphasis', start: 13, end: 17 }
  ]
]);

doc.apply(tr);
```

### Multiple Operations

Chain multiple operations in a single transaction:

```js
const tr = doc.tr;

// Create new paragraph
const new_para = {
  id: 'paragraph_3',
  type: 'paragraph',
  content: ['Another paragraph', []]
};
tr.create(new_para);

// Update page body
const body = doc.get(['page_1', 'body']);
tr.set(['page_1', 'body'], [...body, 'paragraph_3']);

// Update page title
tr.set(['page_1', 'title'], 'Updated Title');

// Apply all at once
doc.apply(tr);
```

### Undo/Redo

```js
// Undo last transaction
doc.undo();

// Redo last undone transaction
doc.redo();

// Check if undo/redo available
if (doc.can_undo) {
  doc.undo();
}

if (doc.can_redo) {
  doc.redo();
}
```

## Common Patterns

### Add New Paragraph

```js
import { nanoid } from 'nanoid';

function add_paragraph(doc, parent_path, index) {
  const tr = doc.tr;
  
  const new_paragraph = {
    id: nanoid(),
    type: 'paragraph',
    layout: 1,
    content: ['', []]
  };
  
  tr.create(new_paragraph);
  tr.insert_at(parent_path, index, [new_paragraph.id]);
  
  doc.apply(tr);
  
  // Set selection to new paragraph
  doc.selection = {
    type: 'text',
    path: [...parent_path, index, 'content'],
    anchor_offset: 0,
    focus_offset: 0
  };
  
  return new_paragraph.id;
}

// Usage
add_paragraph(doc, ['page_1', 'body'], 0);
```

### Delete Selected Nodes

```js
function delete_selected_nodes(doc) {
  const sel = doc.selection;
  
  if (sel.type !== 'node') return;
  
  const parent_path = sel.path;
  const nodes = doc.get(parent_path);
  
  const tr = doc.tr;
  
  // Remove nodes from array
  const start = Math.min(sel.anchor_offset, sel.focus_offset);
  const end = Math.max(sel.anchor_offset, sel.focus_offset);
  const deleted_ids = nodes.slice(start, end);
  const updated_nodes = [
    ...nodes.slice(0, start),
    ...nodes.slice(end)
  ];
  
  tr.set(parent_path, updated_nodes);
  
  // Delete the actual nodes
  deleted_ids.forEach(id => tr.delete(id));
  
  doc.apply(tr);
  
  // Update selection
  doc.selection = {
    type: 'node',
    path: parent_path,
    anchor_offset: start,
    focus_offset: start
  };
}
```

### Toggle Text Annotation

```js
function toggle_annotation(doc, annotation_type) {
  const sel = doc.selection;
  
  if (sel.type !== 'text') return;
  
  const [text, annotations] = doc.get(sel.path);
  const start = Math.min(sel.anchor_offset, sel.focus_offset);
  const end = Math.max(sel.anchor_offset, sel.focus_offset);
  
  const tr = doc.tr;
  
  // Check if range already has this annotation
  const has_annotation = annotations.some(
    ann => ann.type === annotation_type && 
           ann.start <= start && 
           ann.end >= end
  );
  
  let new_annotations;
  if (has_annotation) {
    // Remove annotation
    new_annotations = annotations.filter(
      ann => !(ann.type === annotation_type && 
               ann.start === start && 
               ann.end === end)
    );
  } else {
    // Add annotation
    new_annotations = [
      ...annotations,
      { type: annotation_type, start, end }
    ];
  }
  
  tr.set(sel.path, [text, new_annotations]);
  doc.apply(tr);
}

// Usage
toggle_annotation(doc, 'strong');
toggle_annotation(doc, 'emphasis');
```

### Move Nodes Up/Down

```js
function move_node_up(doc, node_path) {
  const parent_path = node_path.slice(0, -1);
  const index = node_path[node_path.length - 1];
  
  if (index === 0) return; // Already at top
  
  const nodes = doc.get(parent_path);
  const tr = doc.tr;
  
  // Swap with previous node
  const updated_nodes = [...nodes];
  [updated_nodes[index - 1], updated_nodes[index]] = 
    [updated_nodes[index], updated_nodes[index - 1]];
  
  tr.set(parent_path, updated_nodes);
  doc.apply(tr);
  
  // Update selection
  doc.selection = {
    type: 'node',
    path: parent_path,
    anchor_offset: index - 1,
    focus_offset: index - 1
  };
}

function move_node_down(doc, node_path) {
  const parent_path = node_path.slice(0, -1);
  const index = node_path[node_path.length - 1];
  const nodes = doc.get(parent_path);
  
  if (index >= nodes.length - 1) return; // Already at bottom
  
  const tr = doc.tr;
  
  // Swap with next node
  const updated_nodes = [...nodes];
  [updated_nodes[index], updated_nodes[index + 1]] = 
    [updated_nodes[index + 1], updated_nodes[index]];
  
  tr.set(parent_path, updated_nodes);
  doc.apply(tr);
  
  // Update selection
  doc.selection = {
    type: 'node',
    path: parent_path,
    anchor_offset: index + 1,
    focus_offset: index + 1
  };
}
```

### Duplicate Node

```js
import { nanoid } from 'nanoid';

function duplicate_node(doc, node_id) {
  const node = doc.get([node_id]);
  const tr = doc.tr;
  
  // Deep clone with new IDs
  function clone_node(original) {
    const cloned = { ...original, id: nanoid() };
    
    // Clone child nodes recursively
    for (const [key, value] of Object.entries(cloned)) {
      if (Array.isArray(value) && key !== 'content') {
        cloned[key] = value.map(child_id => {
          const child = doc.get([child_id]);
          return clone_node(child).id;
        });
      }
    }
    
    tr.create(cloned);
    return cloned;
  }
  
  const cloned = clone_node(node);
  doc.apply(tr);
  
  return cloned.id;
}
```

### Change Node Type

```js
function change_node_type(doc, node_id, new_type) {
  const old_node = doc.get([node_id]);
  const tr = doc.tr;
  
  // Create new node with same content where applicable
  const new_node = {
    id: node_id,
    type: new_type,
  };
  
  // Copy compatible properties
  const new_schema = doc.get_node_schema(new_type);
  for (const [prop_name, prop_def] of Object.entries(new_schema.properties)) {
    if (prop_name in old_node) {
      // Type-check and copy if compatible
      new_node[prop_name] = old_node[prop_name];
    } else if ('default' in prop_def) {
      new_node[prop_name] = prop_def.default;
    }
  }
  
  // Delete old node
  tr.delete(node_id);
  
  // Create new node
  tr.create(new_node);
  
  doc.apply(tr);
}
```

## Reactive State

Document nodes are reactive using Svelte 5's `$state`:

```svelte
<script>
  let paragraph = $derived(doc.get(['paragraph_1']));
  let content = $derived(paragraph.content);
</script>

<!-- Automatically updates when document changes -->
<p>{content[0]}</p>
```

To get a snapshot (non-reactive):

```js
import { $state } from 'svelte';

const snapshot = $state.snapshot(doc.get(['paragraph_1']));
```

## Best Practices

### 1. Use Transactions for All Changes

```js
// ✅ Good
const tr = doc.tr;
tr.set(['page_1', 'title'], 'New Title');
doc.apply(tr);

// ❌ Bad - bypasses undo/redo
const page = doc.get(['page_1']);
page.title = 'New Title'; // Don't do this!
```

### 2. Batch Multiple Changes

```js
// ✅ Good - single transaction
const tr = doc.tr;
tr.set(['page_1', 'title'], 'New Title');
tr.set(['page_1', 'published'], true);
doc.apply(tr);

// ❌ Less efficient - multiple transactions
const tr1 = doc.tr;
tr1.set(['page_1', 'title'], 'New Title');
doc.apply(tr1);

const tr2 = doc.tr;
tr2.set(['page_1', 'published'], true);
doc.apply(tr2);
```

### 3. Clean Up Deleted Nodes

```js
// When removing nodes from arrays, also delete them
const tr = doc.tr;

const body = doc.get(['page_1', 'body']);
const removed_id = body[0];

// Remove from array
tr.set(['page_1', 'body'], body.slice(1));

// Delete the node
tr.delete(removed_id);

doc.apply(tr);
```

### 4. Validate Before Applying

```js
function safe_set(doc, path, value) {
  try {
    const tr = doc.tr;
    tr.set(path, value);
    doc.apply(tr);
    return true;
  } catch (error) {
    console.error('Failed to set value:', error);
    return false;
  }
}
```

## Error Handling

```js
try {
  const tr = doc.tr;
  tr.set(['invalid', 'path'], 'value');
  doc.apply(tr);
} catch (error) {
  console.error('Transaction failed:', error.message);
}
```

Common errors:
- Invalid path (node doesn't exist)
- Type mismatch (wrong value type for property)
- Schema violation (invalid node type in array)
- Circular reference

## Next Steps

- Learn about [Selections](./selection-system.md)
- Build [Custom Components](./custom-components.md)
- Review [Getting Started](./getting-started.md)
