# Building Custom Components

Learn how to create custom Svelte components for rendering and editing your content nodes.

## Overview

In Svedit, every node type is rendered by a corresponding Svelte component. You define these components and register them in your document configuration.

## Component Types

### Node Components

Node components render your content nodes. Examples:
- `Page.svelte` - Renders a page
- `Paragraph.svelte` - Renders a paragraph
- `Heading.svelte` - Renders a heading
- `List.svelte` - Renders a list
- `Image.svelte` - Renders an image

### System Components

System components provide essential editor functionality:
- `NodeCursorTrap.svelte` - Handles cursor positioning for block nodes
- `Overlays.svelte` - Renders editing overlays and UI

## Basic Node Component

Here's a minimal node component:

```svelte
<!-- Text.svelte -->
<script>
  import { AnnotatedTextProperty } from 'svedit';
  
  let { doc, path } = $props();
  
  let node = $derived(doc.get(path));
</script>

<AnnotatedTextProperty {doc} path={[...path, 'content']} />
```

### Component Props

All node components receive:
- **`doc`** - The Document instance
- **`path`** - Path to the node (e.g., `['page_1', 'body', 0]`)

## Using Built-in Components

### AnnotatedTextProperty

Renders editable rich text:

```svelte
<script>
  import { AnnotatedTextProperty } from 'svedit';
  
  let { doc, path } = $props();
</script>

<AnnotatedTextProperty {doc} path={[...path, 'content']} />
```

For multi-line text, wrap in a block element:

```svelte
<p>
  <AnnotatedTextProperty {doc} path={[...path, 'content']} />
</p>
```

### NodeArrayProperty

Renders a list of nodes:

```svelte
<script>
  import { NodeArrayProperty } from 'svedit';
  
  let { doc, path } = $props();
</script>

<NodeArrayProperty {doc} path={[...path, 'body']} />
```

This will render each node in the array with its corresponding component.

### Node

Renders a single node by reference:

```svelte
<script>
  import { Node } from 'svedit';
  
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  let hero_id = $derived(node.hero);
</script>

{#if hero_id}
  <Node {doc} path={[hero_id]} />
{/if}
```

### CustomProperty

For non-text, non-node properties (strings, numbers, etc.):

```svelte
<script>
  import { CustomProperty } from 'svedit';
  
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
</script>

<input 
  type="text"
  value={node.url}
  oninput={(e) => {
    const tr = doc.tr;
    tr.set([...path, 'url'], e.target.value);
    doc.apply(tr);
  }}
/>

<!-- Or use CustomProperty for standard input -->
<CustomProperty 
  {doc} 
  path={[...path, 'url']} 
  type="text"
  placeholder="Enter URL"
/>
```

## Example Components

### Paragraph Component

```svelte
<!-- Paragraph.svelte -->
<script>
  import { AnnotatedTextProperty } from 'svedit';
  
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  
  // Support multiple layout styles
  let css_class = $derived(`paragraph layout-${node.layout || 1}`);
</script>

<p class={css_class}>
  <AnnotatedTextProperty {doc} path={[...path, 'content']} />
</p>

<style>
  .paragraph {
    margin: 1em 0;
  }
  
  .layout-1 {
    font-size: 1rem;
  }
  
  .layout-2 {
    font-size: 1.2rem;
    font-weight: 300;
  }
  
  .layout-3 {
    font-style: italic;
    padding-left: 2em;
    border-left: 3px solid #ccc;
  }
</style>
```

### Heading Component

```svelte
<!-- Heading.svelte -->
<script>
  import { AnnotatedTextProperty } from 'svedit';
  
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  let level = $derived(node.level || 2);
  let Tag = $derived(`h${level}`);
</script>

<svelte:element this={Tag}>
  <AnnotatedTextProperty {doc} path={[...path, 'content']} />
</svelte:element>

<style>
  h1, h2, h3, h4, h5, h6 {
    margin: 0.8em 0 0.5em;
    font-weight: 700;
  }
</style>
```

### List Component

```svelte
<!-- List.svelte -->
<script>
  import { NodeArrayProperty } from 'svedit';
  
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  let list_type = $derived(node.list_type || 'unordered');
  let Tag = $derived(list_type === 'ordered' ? 'ol' : 'ul');
</script>

<svelte:element this={Tag}>
  <NodeArrayProperty {doc} path={[...path, 'items']} />
</svelte:element>

<style>
  ul, ol {
    margin: 1em 0;
    padding-left: 2em;
  }
</style>
```

### List Item Component

```svelte
<!-- ListItem.svelte -->
<script>
  import { AnnotatedTextProperty } from 'svedit';
  
  let { doc, path } = $props();
</script>

<li>
  <AnnotatedTextProperty {doc} path={[...path, 'content']} />
</li>
```

### Image Component

```svelte
<!-- Image.svelte -->
<script>
  import { CustomProperty } from 'svedit';
  
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  let editable = $derived(doc.editable);
</script>

<figure class="image-node">
  {#if editable}
    <div class="image-controls">
      <CustomProperty 
        {doc} 
        path={[...path, 'src']} 
        type="text"
        placeholder="Image URL"
      />
      <CustomProperty 
        {doc} 
        path={[...path, 'alt']} 
        type="text"
        placeholder="Alt text"
      />
    </div>
  {/if}
  
  <img src={node.src} alt={node.alt} />
  
  {#if node.caption}
    <figcaption>
      <AnnotatedTextProperty {doc} path={[...path, 'caption']} />
    </figcaption>
  {/if}
</figure>

<style>
  .image-node {
    margin: 2em 0;
  }
  
  .image-controls {
    margin-bottom: 0.5em;
    padding: 0.5em;
    background: #f5f5f5;
    border-radius: 4px;
  }
  
  img {
    max-width: 100%;
    height: auto;
  }
  
  figcaption {
    margin-top: 0.5em;
    font-size: 0.9em;
    color: #666;
  }
</style>
```

### Page Component

```svelte
<!-- Page.svelte -->
<script>
  import { NodeArrayProperty, Node } from 'svedit';
  
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
</script>

<article class="page">
  {#if node.hero}
    <Node {doc} path={[node.hero]} />
  {/if}
  
  <div class="page-body">
    <NodeArrayProperty {doc} path={[...path, 'body']} />
  </div>
</article>

<style>
  .page {
    max-width: 800px;
    margin: 0 auto;
    padding: 2em;
  }
  
  .page-body {
    margin-top: 2em;
  }
</style>
```

## System Components

### NodeCursorTrap

Provides visual feedback for node selection:

```svelte
<!-- NodeCursorTrap.svelte -->
<script>
  let { active = false } = $props();
</script>

<div class="cursor-trap" class:active>
  <div contenteditable="false" class="node-cursor">​</div>
</div>

<style>
  .cursor-trap {
    position: relative;
    height: 0;
    overflow: visible;
  }
  
  .node-cursor {
    position: absolute;
    top: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: transparent;
    pointer-events: none;
  }
  
  .active .node-cursor {
    background: #0066ff;
  }
</style>
```

### Overlays

Renders editing overlays and controls:

```svelte
<!-- Overlays.svelte -->
<script>
  let { doc } = $props();
  let selection = $derived(doc.selection);
  
  let show_toolbar = $derived(
    selection?.type === 'text' &&
    selection.anchor_offset !== selection.focus_offset
  );
</script>

{#if show_toolbar}
  <div class="text-formatting-toolbar">
    <button onclick={() => toggle_annotation(doc, 'strong')}>
      Bold
    </button>
    <button onclick={() => toggle_annotation(doc, 'emphasis')}>
      Italic
    </button>
    <button onclick={() => toggle_annotation(doc, 'link')}>
      Link
    </button>
  </div>
{/if}

<style>
  .text-formatting-toolbar {
    position: fixed;
    top: 10px;
    right: 10px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 0.5em;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  
  button {
    margin: 0 0.25em;
    padding: 0.5em 1em;
    border: none;
    background: #f0f0f0;
    border-radius: 3px;
    cursor: pointer;
  }
  
  button:hover {
    background: #e0e0e0;
  }
</style>
```

## Annotation Components

Define how annotations are rendered:

```svelte
<!-- Strong.svelte -->
<strong><slot /></strong>

<!-- Emphasis.svelte -->
<em><slot /></em>

<!-- Highlight.svelte -->
<mark><slot /></mark>

<!-- Link.svelte -->
<script>
  let { annotation } = $props();
</script>

<a href={annotation.href} target="_blank" rel="noopener">
  <slot />
</a>
```

Register these in your config:

```js
const document_config = {
  // ...
  annotation_components: {
    strong: Strong,
    emphasis: Emphasis,
    highlight: Highlight,
    link: Link,
  }
};
```

## Registering Components

Add all components to your config:

```js
import Page from './components/Page.svelte';
import Paragraph from './components/Paragraph.svelte';
import Heading from './components/Heading.svelte';
import List from './components/List.svelte';
import ListItem from './components/ListItem.svelte';
import Image from './components/Image.svelte';

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
    List,
    ListItem,
    Image,
  },
};
```

Component names must match node types in PascalCase:
- `paragraph` → `Paragraph`
- `list_item` → `ListItem`
- `image_grid` → `ImageGrid`

## Edit vs View Mode

Conditionally render based on edit state:

```svelte
<script>
  import { AnnotatedTextProperty, CustomProperty } from 'svedit';
  
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  let editable = $derived(doc.editable);
</script>

{#if editable}
  <!-- Edit mode -->
  <div class="button-editor">
    <label>
      Label:
      <CustomProperty {doc} path={[...path, 'label']} type="text" />
    </label>
    <label>
      URL:
      <CustomProperty {doc} path={[...path, 'href']} type="text" />
    </label>
  </div>
{:else}
  <!-- View mode -->
  <a href={node.href} class="button">
    {node.label}
  </a>
{/if}
```

## Handling User Input

### Text Input

Use `AnnotatedTextProperty` - it handles everything automatically:

```svelte
<AnnotatedTextProperty {doc} path={[...path, 'content']} />
```

### Simple Properties

Use controlled inputs with transactions:

```svelte
<script>
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  
  function update_title(value) {
    const tr = doc.tr;
    tr.set([...path, 'title'], value);
    doc.apply(tr);
  }
</script>

<input
  type="text"
  value={node.title}
  oninput={(e) => update_title(e.target.value)}
/>
```

### Checkbox

```svelte
<script>
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  
  function toggle_published() {
    const tr = doc.tr;
    tr.set([...path, 'published'], !node.published);
    doc.apply(tr);
  }
</script>

<label>
  <input
    type="checkbox"
    checked={node.published}
    onchange={toggle_published}
  />
  Published
</label>
```

### Select Dropdown

```svelte
<script>
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  
  function update_layout(value) {
    const tr = doc.tr;
    tr.set([...path, 'layout'], parseInt(value));
    doc.apply(tr);
  }
</script>

<select 
  value={node.layout} 
  onchange={(e) => update_layout(e.target.value)}
>
  <option value="1">Default</option>
  <option value="2">Large</option>
  <option value="3">Callout</option>
</select>
```

## Advanced Patterns

### Dynamic Layout Switching

```svelte
<script>
  import { AnnotatedTextProperty } from 'svedit';
  
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  let layout = $derived(node.layout || 1);
</script>

{#if layout === 1}
  <p class="normal">
    <AnnotatedTextProperty {doc} path={[...path, 'content']} />
  </p>
{:else if layout === 2}
  <div class="callout">
    <AnnotatedTextProperty {doc} path={[...path, 'content']} />
  </div>
{:else if layout === 3}
  <blockquote class="quote">
    <AnnotatedTextProperty {doc} path={[...path, 'content']} />
  </blockquote>
{/if}
```

### Conditional Properties

```svelte
<script>
  import { AnnotatedTextProperty, CustomProperty } from 'svedit';
  
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
</script>

<div class="hero">
  <AnnotatedTextProperty {doc} path={[...path, 'title']} />
  
  {#if node.description}
    <AnnotatedTextProperty {doc} path={[...path, 'description']} />
  {/if}
  
  {#if node.background_image}
    <img src={node.background_image} alt="" class="background" />
  {/if}
</div>
```

### Nested Components

```svelte
<script>
  import { NodeArrayProperty } from 'svedit';
  
  let { doc, path } = $props();
</script>

<div class="two-column-layout">
  <div class="column">
    <NodeArrayProperty {doc} path={[...path, 'left_column']} />
  </div>
  <div class="column">
    <NodeArrayProperty {doc} path={[...path, 'right_column']} />
  </div>
</div>
```

## Best Practices

### 1. Keep Components Simple

Focus each component on rendering one node type well.

### 2. Use Derived State

```svelte
<script>
  let { doc, path } = $props();
  let node = $derived(doc.get(path));
  let title = $derived(node.title);
</script>
```

### 3. Handle Missing Data

```svelte
{#if node.image}
  <img src={node.image} alt={node.alt || ''} />
{:else}
  <div class="placeholder">No image</div>
{/if}
```

### 4. Respect contenteditable Rules

- Don't wrap `<AnnotatedTextProperty>` in `contenteditable="false"`
- Don't nest `contenteditable="true"` islands
- Don't use `<a>` tags in edit mode (use `<div>` instead)

### 5. Use Proper HTML Structure

```svelte
<!-- ✅ Good -->
<p>
  <AnnotatedTextProperty {doc} path={[...path, 'content']} />
</p>

<!-- ❌ Bad - no block wrapper -->
<AnnotatedTextProperty {doc} path={[...path, 'content']} />
```

## Styling Components

### Scoped Styles

```svelte
<style>
  .paragraph {
    margin: 1em 0;
    line-height: 1.6;
  }
</style>
```

### Global Styles

Define in your main app:

```css
/* app.css */
.svedit-canvas {
  font-family: system-ui, sans-serif;
  line-height: 1.6;
  color: #333;
}
```

### Edit Mode Styles

```svelte
<style>
  .node {
    position: relative;
  }
  
  :global(.editable) .node:hover {
    outline: 2px solid #0066ff;
    outline-offset: 2px;
  }
</style>
```

## Debugging Tips

### Log Props

```svelte
<script>
  let { doc, path } = $props();
  
  $effect(() => {
    console.log('Node path:', path);
    console.log('Node data:', doc.get(path));
  });
</script>
```

### Inspect Document State

```svelte
<script>
  let { doc, path } = $props();
  
  $effect(() => {
    console.log('All nodes:', $state.snapshot(doc.nodes));
    console.log('Selection:', doc.selection);
  });
</script>
```

## Next Steps

- Review the [Schema Guide](./schema-guide.md) for defining node types
- Learn about the [Selection System](./selection-system.md)
- Explore the [Document API](./document-api.md)
- Check out the [Getting Started Guide](./getting-started.md)
