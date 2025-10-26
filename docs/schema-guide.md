# Schema Definition Guide

This guide explains how to define schemas for your Svedit documents.

## What is a Schema?

A schema defines the structure and constraints of your document content. It specifies:
- What types of nodes exist
- What properties each node type has
- What types of values properties can hold
- What types of child nodes can be nested

## Defining a Schema

Use the `define_document_schema` helper to create type-safe schemas:

```js
import { define_document_schema } from 'svedit';

const document_schema = define_document_schema({
  // Node type definitions go here
});
```

## Node Type Definition

Each node type has a `kind` and `properties`:

```js
{
  my_node_type: {
    kind: 'text' | 'block' | 'document',
    properties: {
      // Property definitions
    }
  }
}
```

### Node Kinds

**`document`** - Top-level nodes
- Accessible via routes
- Examples: page, post, article
- Entry points to your content

**`text`** - Text-based nodes
- Must have a property named `content` of type `annotated_text`
- Can be split and merged during editing
- Examples: paragraph, heading, list_item

**`block`** - Container/structural nodes
- Everything that's not document or text
- Examples: list, image, video, nav, hero

## Property Types

### Primitive Types

**String**
```js
properties: {
  title: { type: 'string' }
}
```

**Integer**
```js
properties: {
  layout: { type: 'integer', default: 1 },
  likes_count: { type: 'integer' }
}
```

**Number** (decimals allowed)
```js
properties: {
  price: { type: 'number' },
  rating: { type: 'number', default: 5.0 }
}
```

**Boolean**
```js
properties: {
  is_published: { type: 'boolean', default: false }
}
```

**DateTime**
```js
properties: {
  created_at: { type: 'datetime' },
  updated_at: { type: 'datetime' }
}
```

### Array Types

**String Array**
```js
properties: {
  tags: { type: 'string_array' },
  keywords: { type: 'string_array' }
}
```

**Integer Array**
```js
properties: {
  daily_visitors: { type: 'integer_array' }
}
```

**Number Array**
```js
properties: {
  prices: { type: 'number_array' }
}
```

**Boolean Array**
```js
properties: {
  features_enabled: { type: 'boolean_array' }
}
```

### Annotated Text

Rich text with formatting annotations:

```js
properties: {
  content: {
    type: 'annotated_text',
    node_types: ['strong', 'emphasis', 'link', 'highlight'],
    allow_newlines: true
  },
  title: {
    type: 'annotated_text',
    node_types: ['emphasis'],
    allow_newlines: false
  }
}
```

**Options:**
- `node_types`: Array of allowed annotation types
- `allow_newlines`: Whether line breaks are permitted

### Reference Types

**Single Node Reference**
```js
properties: {
  hero_image: {
    type: 'node',
    node_types: ['image'],
    default_node_type: 'image'
  }
}
```

**Node Array Reference**
```js
properties: {
  body: {
    type: 'node_array',
    node_types: ['paragraph', 'heading', 'image', 'list'],
    default_node_type: 'paragraph'
  }
}
```

**Options:**
- `node_types`: Array of allowed node types for this property
- `default_node_type`: Type to use when creating new nodes (optional)

## Complete Example

```js
const document_schema = define_document_schema({
  // Document node
  page: {
    kind: 'document',
    properties: {
      title: { type: 'string' },
      body: {
        type: 'node_array',
        node_types: ['paragraph', 'heading', 'image', 'list'],
        default_node_type: 'paragraph',
      },
      hero: {
        type: 'node',
        node_types: ['hero'],
      },
      tags: { type: 'string_array' },
      published: { type: 'boolean', default: false },
      created_at: { type: 'datetime' }
    }
  },
  
  // Text nodes
  paragraph: {
    kind: 'text',
    properties: {
      layout: { type: 'integer', default: 1 },
      content: {
        type: 'annotated_text',
        node_types: ['strong', 'emphasis', 'link'],
        allow_newlines: true
      }
    }
  },
  
  heading: {
    kind: 'text',
    properties: {
      level: { type: 'integer', default: 2 },
      content: {
        type: 'annotated_text',
        node_types: ['emphasis'],
        allow_newlines: false
      }
    }
  },
  
  // Block nodes
  list: {
    kind: 'block',
    properties: {
      list_type: { type: 'string', default: 'unordered' },
      items: {
        type: 'node_array',
        node_types: ['list_item'],
        default_node_type: 'list_item'
      }
    }
  },
  
  list_item: {
    kind: 'text',
    properties: {
      content: {
        type: 'annotated_text',
        node_types: ['strong', 'emphasis'],
        allow_newlines: false
      }
    }
  },
  
  image: {
    kind: 'block',
    properties: {
      src: { type: 'string' },
      alt: { type: 'string' },
      width: { type: 'integer' },
      height: { type: 'integer' },
      caption: {
        type: 'annotated_text',
        node_types: [],
        allow_newlines: false
      }
    }
  },
  
  hero: {
    kind: 'block',
    properties: {
      layout: { type: 'integer', default: 1 },
      title: {
        type: 'annotated_text',
        node_types: ['emphasis'],
        allow_newlines: false
      },
      description: {
        type: 'annotated_text',
        node_types: ['strong', 'emphasis', 'link'],
        allow_newlines: true
      },
      background_image: { type: 'string' }
    }
  }
});
```

## Serialized Document Format

Once you have a schema, your data must follow this structure:

```js
const serialized_doc = [
  // Define referenced nodes first (bottom-up order)
  {
    id: 'list_item_1',
    type: 'list_item',
    content: ['First item', []]
  },
  {
    id: 'list_item_2',
    type: 'list_item',
    content: ['Second item', []]
  },
  {
    id: 'list_1',
    type: 'list',
    list_type: 'unordered',
    items: ['list_item_1', 'list_item_2']
  },
  {
    id: 'paragraph_1',
    type: 'paragraph',
    layout: 1,
    content: ['Hello world!', []]
  },
  {
    id: 'hero_1',
    type: 'hero',
    layout: 1,
    title: ['Welcome', []],
    description: ['This is a hero section', []],
    background_image: '/images/hero-bg.jpg'
  },
  // Document node must be last
  {
    id: 'page_1',
    type: 'page',
    title: 'My Page',
    body: ['hero_1', 'paragraph_1', 'list_1'],
    tags: ['demo', 'tutorial'],
    published: false,
    created_at: '2024-01-01T00:00:00Z'
  }
];
```

### Document Serialization Rules

1. **Node Order**: Referenced nodes must be defined before nodes that reference them
2. **Document Node**: Must have the same `id` as the document ID
3. **No Cycles**: No circular references allowed
4. **All Reachable**: All nodes must be reachable from the document node
5. **Type Field**: Optional if the node id contains the type (e.g., `paragraph_1` → type is `paragraph`)

## Annotated Text Format

Annotated text is stored as a tuple: `[text, annotations]`

```js
// Plain text
content: ['Hello world', []]

// With annotations
content: [
  'Hello world',
  [
    { type: 'strong', start: 0, end: 5 },      // "Hello" is bold
    { type: 'emphasis', start: 6, end: 11 }    // "world" is italic
  ]
]

// With link annotation
content: [
  'Click here',
  [
    { 
      type: 'link', 
      start: 6, 
      end: 10,
      href: 'https://example.com'
    }
  ]
]
```

## Schema Validation

The Document constructor validates your schema:

```js
try {
  const doc = new Document(document_schema, serialized_doc, { config });
} catch (error) {
  console.error('Schema validation failed:', error.message);
}
```

Common validation errors:
- Referenced node types don't exist in schema
- Property types don't match schema
- Missing required properties
- Invalid annotation types

## Best Practices

### 1. Use Semantic Names
```js
// Good
paragraph: { kind: 'text', ... }
heading: { kind: 'text', ... }

// Avoid
text_1: { kind: 'text', ... }
text_2: { kind: 'text', ... }
```

### 2. Set Sensible Defaults
```js
properties: {
  layout: { type: 'integer', default: 1 },
  published: { type: 'boolean', default: false }
}
```

### 3. Limit Annotation Types
```js
// For headings - keep it simple
title: {
  type: 'annotated_text',
  node_types: ['emphasis'],  // Only italics
  allow_newlines: false
}

// For body text - more options
content: {
  type: 'annotated_text',
  node_types: ['strong', 'emphasis', 'link', 'highlight'],
  allow_newlines: true
}
```

### 4. Use Specific Node Types
```js
// Good - specific allowed types
body: {
  type: 'node_array',
  node_types: ['paragraph', 'heading', 'image'],
  default_node_type: 'paragraph'
}

// Avoid - too permissive
body: {
  type: 'node_array',
  node_types: ['paragraph', 'heading', 'image', 'video', 'list', 'quote', 'code'],
  default_node_type: 'paragraph'
}
```

### 5. Group Related Properties
```js
image: {
  kind: 'block',
  properties: {
    // Core properties
    src: { type: 'string' },
    alt: { type: 'string' },
    
    // Dimensions
    width: { type: 'integer' },
    height: { type: 'integer' },
    
    // Optional metadata
    caption: { type: 'annotated_text', ... },
    photographer: { type: 'string' }
  }
}
```

## Advanced Patterns

### Shared Content Nodes

Define reusable components that can be referenced from multiple places:

```js
const document_schema = define_document_schema({
  page: {
    kind: 'document',
    properties: {
      navigation: {
        type: 'node',
        node_types: ['nav']
      },
      body: {
        type: 'node_array',
        node_types: ['paragraph']
      }
    }
  },
  nav: {
    kind: 'block',
    properties: {
      items: {
        type: 'node_array',
        node_types: ['nav_item']
      }
    }
  },
  nav_item: {
    kind: 'block',
    properties: {
      label: { type: 'string' },
      url: { type: 'string' }
    }
  },
  paragraph: {
    kind: 'text',
    properties: {
      content: { type: 'annotated_text', ... }
    }
  }
});
```

Now multiple pages can reference the same `nav` node, and editing it will update all pages.

### Layout Variants

Use an integer property to support multiple layout styles:

```js
text: {
  kind: 'text',
  properties: {
    layout: { type: 'integer', default: 1 },
    content: { type: 'annotated_text', ... }
  }
}
```

Then in your component:
```svelte
{#if node.layout === 1}
  <p class="normal">{content}</p>
{:else if node.layout === 2}
  <p class="callout">{content}</p>
{:else if node.layout === 3}
  <p class="quote">{content}</p>
{/if}
```

## Next Steps

- Learn about the [Document API](./document-api.md)
- Understand [Selections](./selection-system.md)
- Build [Custom Components](./custom-components.md)
