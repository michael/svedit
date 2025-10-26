# Svedit Documentation

Complete guides for implementing Svedit in your Svelte applications.

## Getting Started

New to Svedit? Start here:

📘 **[Getting Started Guide](./getting-started.md)**
- Quick start tutorial
- Basic concepts
- Setup and installation
- Your first editable document

## Core Guides

### Schema Definition

📗 **[Schema Guide](./schema-guide.md)**
- Defining document schemas
- Node types and properties
- Property types (primitives, arrays, references)
- Annotated text format
- Serialized document structure
- Best practices and patterns

### Document API

📕 **[Document API Reference](./document-api.md)**
- Document class overview
- Reading and traversing data
- Transaction system
- Undo/redo functionality
- Common patterns and examples
- Error handling

### Selection System

📙 **[Selection System Guide](./selection-system.md)**
- Three selection types (text, node, property)
- Reading and setting selections
- Selection utilities and helpers
- Working with annotations
- Advanced patterns
- contenteditable integration

### Custom Components

📓 **[Building Custom Components](./custom-components.md)**
- Creating node components
- Using built-in components (AnnotatedTextProperty, NodeArrayProperty, etc.)
- System components (NodeCursorTrap, Overlays)
- Annotation components
- Handling user input
- Edit vs view mode
- Best practices and styling

## Quick Reference

### Basic Setup

```js
import { Document, define_document_schema } from 'svedit';
import { nanoid } from 'nanoid';

// 1. Define schema
const schema = define_document_schema({
  page: {
    kind: 'document',
    properties: {
      body: {
        type: 'node_array',
        node_types: ['paragraph'],
        default_node_type: 'paragraph'
      }
    }
  },
  paragraph: {
    kind: 'text',
    properties: {
      content: { type: 'annotated_text', allow_newlines: true }
    }
  }
});

// 2. Create document
const doc = new Document(schema, serialized_doc, {
  config: {
    generate_id: () => nanoid(),
    system_components: { NodeCursorTrap, Overlays },
    node_components: { Page, Paragraph }
  }
});

// 3. Render
<Svedit {doc} path={[doc.document_id]} bind:editable />
```

### Common Operations

**Reading data:**
```js
const node = doc.get(['page_1', 'body', 0]);
const content = doc.get(['page_1', 'body', 0, 'content']);
```

**Modifying data:**
```js
const tr = doc.tr;
tr.set(['paragraph_1', 'content'], ['New text', []]);
doc.apply(tr);
```

**Working with selections:**
```js
// Get selection
const sel = doc.selection;

// Set text selection
doc.selection = {
  type: 'text',
  path: ['page_1', 'body', 0, 'content'],
  anchor_offset: 0,
  focus_offset: 5
};
```

### Property Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text string | `"Hello"` |
| `integer` | Whole number | `42` |
| `number` | Decimal number | `3.14` |
| `boolean` | True/false | `true` |
| `datetime` | Date/time | `"2024-01-01T00:00:00Z"` |
| `annotated_text` | Rich text | `["Hello", [{type: "strong", start: 0, end: 5}]]` |
| `string_array` | Array of strings | `["tag1", "tag2"]` |
| `integer_array` | Array of integers | `[1, 2, 3]` |
| `node` | Single node reference | `"paragraph_1"` |
| `node_array` | Array of node refs | `["paragraph_1", "list_1"]` |

### Node Kinds

| Kind | Description | Required Property |
|------|-------------|------------------|
| `document` | Top-level nodes | - |
| `text` | Text nodes | `content: annotated_text` |
| `block` | Container nodes | - |

## Architecture

```
┌─────────────────────────────────────┐
│          Svedit Component           │
│  (contenteditable wrapper)          │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │   Document   │
        │   (state)    │
        └──────┬───────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼───┐  ┌──▼──┐   ┌──▼────┐
│ Nodes │  │ Sel │   │ Trans │
│ Graph │  │     │   │       │
└───────┘  └─────┘   └───────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼──────────▼──────────▼───┐
│    Your Custom Components   │
│  (Page, Text, List, etc.)   │
└─────────────────────────────┘
```

## Key Concepts

### Graph Data Model

Documents are graphs of nodes with references:

```
page_1 (document)
  └─ body: [paragraph_1, list_1, hero_1]
      ├─ paragraph_1 (text)
      │   └─ content: "Hello world"
      ├─ list_1 (block)
      │   └─ items: [list_item_1, list_item_2]
      └─ hero_1 (block)
          ├─ title: "Welcome"
          └─ image: "hero.jpg"
```

Nodes can be shared across multiple documents for reusable content.

### Transactions

All changes go through transactions for undo/redo:

```js
const tr = doc.tr;
tr.set(path, value);      // Modify property
tr.create(node);          // Create node
tr.delete(node_id);       // Delete node
doc.apply(tr);            // Apply changes
```

### Selection Model

Three types map to different editing scenarios:

- **Text** - Character-level editing in rich text
- **Node** - Block-level operations (delete, move, etc.)
- **Property** - Atomic property selection (images, URLs)

### Reactivity

Built on Svelte 5's `$state` runes:

```svelte
<script>
  let node = $derived(doc.get(path));
  let title = $derived(node.title);
</script>

<!-- Automatically updates when doc changes -->
<h1>{title}</h1>
```

## Best Practices

### Schema Design

✅ **Do:**
- Use semantic node type names
- Set sensible defaults
- Limit annotation types per property
- Be specific about allowed node types

❌ **Don't:**
- Use generic names like `text_1`, `block_2`
- Allow too many node types in arrays
- Mix incompatible types

### Component Design

✅ **Do:**
- Keep components focused on one node type
- Use `$derived` for reactive state
- Handle missing/optional data gracefully
- Respect contenteditable rules

❌ **Don't:**
- Nest `contenteditable` attributes
- Wrap `AnnotatedTextProperty` in `contenteditable="false"`
- Use `<a>` tags in edit mode
- Apply `position: relative` to `AnnotatedTextProperty` parent

### Transaction Usage

✅ **Do:**
- Use transactions for all changes
- Batch multiple operations
- Clean up deleted nodes
- Validate before applying

❌ **Don't:**
- Mutate nodes directly
- Create many small transactions
- Leave orphaned nodes
- Ignore errors

## Troubleshooting

### Common Issues

**Cursor not appearing**
- Check only one `contenteditable="true"` at root
- Verify no nested `contenteditable` islands
- Ensure `NodeCursorTrap` is properly rendered

**Selection not working**
- Validate selection paths exist
- Check selection type matches property type
- Verify DOM structure matches expectations

**Changes not saving**
- Ensure using transactions
- Check `doc.apply(tr)` is called
- Verify serialization works

**Components not rendering**
- Check component is registered in config
- Verify component name matches node type (PascalCase)
- Ensure schema defines the node type

## Resources

- **Demo**: [svedit.vercel.app](https://svedit.vercel.app)
- **Source**: [github.com/whishkid/svedit](https://github.com/whishkid/svedit)
- **Starter**: [github.com/michael/hello-svedit](https://github.com/michael/hello-svedit)

## Contributing

Svedit is in active development. For questions, issues, or contributions:

- Open issues on [GitHub](https://github.com/whishkid/svedit/issues)
- Contact [Michael Aufreiter](https://editable.website) for sponsorship

## License

MIT License - see [LICENSE](../LICENSE) for details

---

**Tip**: Start with the [Getting Started Guide](./getting-started.md) and work through the guides in order for the best learning experience.
