# Getting Started with Svedit

This guide will help you implement Svedit in your Svelte application to create in-place editable content.

## What is Svedit?

Svedit (Svelte Edit) is a lightweight library for building editable websites in Svelte. You can model your content in JSON, render it with custom Svelte components, and edit it directly in the layout.

## Quick Start

### 1. Install Dependencies

Clone the starter template:

```bash
git clone https://github.com/michael/hello-svedit
cd hello-svedit
npm install
```

Or add Svedit to your existing Svelte project:

```bash
npm install svedit svelte@^5.0.0
```

### 2. Define Your Document Schema

Create a schema that defines your content types:

```js
import { define_document_schema } from 'svedit';

const document_schema = define_document_schema({
  page: {
    kind: 'document',
    properties: {
      body: {
        type: 'node_array',
        node_types: ['paragraph', 'heading'],
        default_node_type: 'paragraph',
      }
    }
  },
  paragraph: {
    kind: 'text',
    properties: {
      content: { 
        type: 'annotated_text', 
        allow_newlines: true 
      }
    }
  },
  heading: {
    kind: 'text',
    properties: {
      content: { 
        type: 'annotated_text', 
        allow_newlines: false 
      },
      level: { 
        type: 'integer', 
        default: 1 
      }
    }
  }
});
```

### 3. Create Your Document Data

Create a serialized document following your schema:

```js
const serialized_doc = [
  {
    id: 'paragraph_1',
    type: 'paragraph',
    content: ['Hello world!', []],
  },
  {
    id: 'heading_1',
    type: 'heading',
    level: 2,
    content: ['My First Heading', []],
  },
  {
    id: 'page_1',
    type: 'page',
    body: ['heading_1', 'paragraph_1'],
  },
];
```

### 4. Configure Svedit

Set up your configuration with custom components:

```js
import { nanoid } from 'nanoid';
import { Document } from 'svedit';

// Import your custom node components
import Page from './components/Page.svelte';
import Paragraph from './components/Paragraph.svelte';
import Heading from './components/Heading.svelte';

// Import system components
import NodeCursorTrap from './components/NodeCursorTrap.svelte';
import Overlays from './components/Overlays.svelte';

const document_config = {
  generate_id: () => nanoid(),
  system_components: {
    NodeCursorTrap,
    Overlays,
  },
  node_components: {
    Page,
    Paragraph,
    Heading,
  },
};
```

### 5. Initialize the Document

Create a Document instance:

```js
const doc = new Document(
  document_schema, 
  serialized_doc, 
  { config: document_config }
);
```

### 6. Render the Editor

Use the `<Svedit>` component to make your content editable:

```svelte
<script>
  import { Svedit } from 'svedit';
  import { doc } from './your-doc-setup.js';
  
  let editable = $state(true);
</script>

<Svedit 
  {doc} 
  path={[doc.document_id]} 
  bind:editable 
/>
```

## Next Steps

- Learn about [Schema Definitions](./schema-guide.md)
- Understand the [Document API](./document-api.md)
- Master the [Selection System](./selection-system.md)
- Build [Custom Components](./custom-components.md)

## Basic Concepts

### Node Kinds

Svedit has three types of node kinds:

- **`document`**: Top-level nodes accessible via routes (e.g., pages, posts)
- **`text`**: Nodes with `annotated_text` content that can be split and joined
- **`block`**: All other nodes (e.g., images, lists, containers)

### Property Types

Properties can hold:

**Primitive values:**
- `string` - Text strings
- `integer` - Whole numbers
- `number` - Decimal numbers
- `boolean` - true/false
- `datetime` - Date/time values
- `annotated_text` - Rich text with formatting
- Arrays: `string_array`, `integer_array`, `number_array`, `boolean_array`

**References:**
- `node` - Single node reference
- `node_array` - Sequence of node references

### Transactions

All document changes must go through transactions for undo/redo support:

```js
const tr = doc.tr;
tr.set(['paragraph_1', 'content'], ['Updated text', []]);
doc.apply(tr);
```

### Selections

Svedit has three selection types:

1. **Text Selection** - Character ranges in text
2. **Node Selection** - Node ranges in arrays
3. **Property Selection** - Individual properties

Access the current selection via `doc.selection`.

## Development Workflow

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Key Principles

1. **Chromeless Canvas** - No UI elements mixed with content; use separate toolbars and overlays
2. **Convention Over Configuration** - Sensible defaults reduce boilerplate
3. **White-box Library** - Full access to internals for customization

## Common Patterns

### Making Existing Content Editable

Wrap your existing Svelte components with Svedit:

```svelte
<Svedit {doc} path={[page_id]} editable={is_editing} />
```

### Toggle Edit Mode

```svelte
<script>
  let editable = $state(false);
  
  function toggle_edit() {
    editable = !editable;
  }
</script>

<button onclick={toggle_edit}>
  {editable ? 'View' : 'Edit'}
</button>

<Svedit {doc} path={[doc.document_id]} bind:editable />
```

### Saving Changes

Serialize the document to save:

```js
function save_document() {
  const serialized = doc.serialize();
  // Send to your backend
  await fetch('/api/save', {
    method: 'POST',
    body: JSON.stringify(serialized)
  });
}
```

## Troubleshooting

### Cursor Issues

- Ensure only one `contenteditable="true"` at root level
- Never nest `contenteditable="true"` inside `contenteditable="false"`
- Don't apply `position: relative` to direct parent of `<AnnotatedTextProperty>`

### Selection Not Working

- Check that your custom components properly integrate `<AnnotatedTextProperty>`
- Verify node paths are correct
- Ensure DOM structure matches expected layout

## Resources

- [Demo](https://svedit.vercel.app) - Live example
- [Source Code](https://github.com/whishkid/svedit) - Read the implementation
- [Starter Template](https://github.com/michael/hello-svedit) - Minimal setup

## Support

For questions and contributions:
- Open issues on [GitHub](https://github.com/whishkid/svedit/issues)
- Contact [Michael Aufreiter](https://editable.website) for sponsorship opportunities
