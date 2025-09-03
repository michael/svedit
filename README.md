# Svedit

Svedit (think Svelte Edit) is a tiny library for building **rich content editors** with Svelte 5. You can model your content in JSON, render it with custom Svelte components, and edit it directly in the layout.

Try the [demo](https://svedit.vercel.app).

## Why Svedit?

Because Svelte‘s reactivity system is **the perfect fit** for building super-lightweight content editing experiences.

In fact, they're so lightweight, you can use them to **make webpages in-place editable**, removing the need for an external Content Management System (CMS).

Svedit just gives you the gluing pieces around **defining a custom document model** and **mapping DOM selections** to the internal model and vice versa.

## Getting started

Clone the bare-bones `hello-svedit` repository:

```bash
git clone https://github.com/michael/hello-svedit
cd hello-svedit
```

Install dependencies:

```bash
npm install
```

And run the development server:

```bash
npm run dev
```

Now make it your own. The next thing you probably want to do is define your own [node types](./src/routes/create_demo_doc.js), add a [Toolbar](./src/routes/components/Toolbar.svelte), and render custom [Overlays](./src/routes/components/Overlays.svelte). For that just get inspired by the [Svedit demo code](./src/routes).

## Principles

**Chromeless canvas:** We keep the canvas chromeless, meaning there's no UI elements like toolbars or menus mingled with the content. You can interact with text directly, but everything else happens via tools are shown in separate overlays or in the fixed toolbar.

**Convention over configuration:** We use conventions and assumptions to reduce configuration code and limit the number of ways something can go wrong. For instance, we assume that a node with a property named `content` of type `string` or `annotated_string` is considered kind `text`, while all other nodes are considered kind `node`. Text nodes have special behavior in the system for editing (e.g. they can be splitted and joined).

**White-box library:** We expose the internals of the library to allow you to customize and extend it to your needs. That means a little bit more work upfront, but in return lets you control "everything" — the toolbar, the overlays, or how fast the node cursor blinks.

## Graph data model

Svedit documents are represented in a simple JSON-based graph data model. There's a globally addressable space, a graph of content nodes if you want. This allows you to share pieces of content not only in the same document, but across multiple documents. E.g. you could share a navigation bar, while still being able to edit it in place (while changes will affect all places they are used).

## Schema definitions

You can use a simple JSON-compatible schema definition language to enforce constraints on your documents. E.g. to make sure a page node always has a property body with references to nodes that are allowed within a page.

First off, everything is a node. The page is a node, and so is a paragraph, a list, a list item, a nav and a nav item.

A top-level node that is accessible via a route we internally call a `document` (e.g. a page, event, etc.)

Properties of nodes can hold values:
- `string`: A good old JavaScript string
- `number`: Just like a number in JavaScript
- `integer`: A number for which Number.isInteger(number) returns true
- `boolean`: true or false
- `string_array`: An array of good old JavaScript strings
- `integer_array`: An array of integers
- `number_array`: An array of numbers
- `annotated_string`: a plain text string, but with annotations (bold, italic, link etc.)

Or references:
- `node`: References a single node (e.g. an image node can reference a global asset node)
- `node_array`: References a sequence of nodes (e.g. page.body references paragraph and list nodes)


```js
const document_schema = {
  page: {
    body: {
      type: 'node_array',
      node_types: ['nav', 'paragraph', 'list'],
      default_node_type: 'paragraph',
    }
  },
  paragraph: {
    content: { type: 'annotated_string' }
  },
  list_item: {
    content: { type: 'annotated_string' },
  },
  list: {
    list_items: {
      type: 'node_array',
      node_types: ['list_item'],
      default_node_type: 'list_item',
    }
  },
  nav: {
    nav_items: {
      type: 'node_array',
      node_types: ['nav_item'],
      default_node_type: 'nav_item',
    }
  },
  nav_item: {
    url: { type: 'string' },
    label: { type: 'string' },
  }
};
```


## Document serialization format (to drive an editing session in the browser)

A document is just a subsets of nodes, with a few rules:

- there must be a node (the document node) with the id of the document as an entry point (e.g. page_1)
- so the document is a node itself, with references to the underlying content (which live in separate nodes)
- all other nodes need to be traversible from that root node (unlinked nodes will be discarded on a save)
- in the serialization format the nodes need to be ordered, so that nodes that are referenced, are already defined (makes it easier to initialize the document)
- Your document must not contain cyclic references for that reason

Here's an example document:
```js
const serialized_doc = [
  {
    id: 'nav_item_1',
    type: 'nav_item',
    url: '/homepage',
    label: 'Home',
  },
  {
    id: 'nav_1',
    type: 'nav',
    nav_items: ['nav_item_1'],
  },
  {
    id: 'paragraph_1',
    content: ['Hello world.', []],
  },
  {
    id: 'list_item_1',
    type: 'list_item',
    content: ['first list item', []],
  },
  {
    id: 'list_item_2',
    type: 'list_item',
    content: ['second list item', []],
  },
  {
    id: 'list_1',
    type: 'list',
    list_items: ['list_item_1', 'list_item_2'],
  },
  {
    id: 'page_1',
    type: 'page',
    body: ['nav_1', 'paragraph_1', 'list_1'],
  },
]
```

## Configuration

For Svedit to work, you also need to provide an app-specific config object, always available via doc.config for introspection.

```js
const document_config = {
  // Provide a custom id generator (ideally a UUID to avoid collisions)
  generate_id: function() {
    return nanoid();
  },
  system_components: {
    NodeCursorTrap,
    Overlay,
  },
  node_components: {
    Page,
    Button,
    Text,
    Story,
    List,
    ListItem,
    ImageGrid,
    ImageGridItem,
    Hero
  },
  // TEMPORARY: Determines how many layouts are available for each node type
  node_layouts: {
    text: 4,
    list: 5,
    list_item: 1,
  },
  // Custom functions to insert new "blank" nodes and setting the selection
  // depending on the intended behavior.
  inserters: {
    text: function(tr, content = ['', []], layout = 1) {
      const new_text = {
   			id: nanoid(),
   			type: 'text',
        layout,
   			content
  		};
  		tr.insert_nodes([new_text]);
    },
  }
};
```

## Document API

The Document API is central to Svedit. First you need to create a Document instance.

```js
const doc = new Document(document_schema, serialized_doc, { config: document_config });
```

To read/traverse and write the document graph:

```js
// get the body (=array of node ids)
const body =  doc.get(['page_1', 'body']); // => ['nav_1', 'paragraph_1', 'list_1']
console.log($state.snapshot(body));
const nav = doc.get(['nav_1']) // => { id: 'nav_1', type: 'nav', nav_items: ['document_nav_item_1'] }
```

## Transaction API

Documents need to be changed through transactions, which can consist of one or
multiple ops that are applied in a single step and are undo/redo-able.

```js
console.log('nav.nav_items before:', $state.snapshot(nav.nav_items));
const tr = doc.tr; // creates a new transaction
const new_nav_items = nav.nav_items.slice(0, -1);
tr.set(['nav_1', 'nav_items'], new_nav_items);
doc.apply(tr); // applies the transaction to the document
console.log('nav.nav_items after:', $state.snapshot(nav.nav_items));
```

## Selections

Selections are at the heart of Svedit. There are just three types of selections:

1. **Text Selection**: A text selection spans across a range of characters in a string. E.g. the below example has a collapsed cursor at position 1 in a text property 'content'.

  ```js
  {
    type: 'text',
    path: ['page_1234', 'body', 0, 'content'],
    anchor_offset: 1,
    focus_offset: 1
  }
  ```

2. **Node Selection**: A node selection spans across a range of nodes inside a node_array. The below example selects the nodes at index 3 and 4.

  ```js
  {
    type: 'node',
    path: ['page_1234', 'body'],
    anchor_offset: 2,
    focus_offset: 4
  }
  ```

3. **Property Selection**: A property selection addresses one particular property of a node.

  ```js
  {
    type: "property",
    path: [
      "page_1",
      "body",
      11,
      "image"
    ]
  }
  ```

You can access the current selection through `doc.selection` anytime. And you can programmatically set the selection using `doc.set_selection(new_selection)`.

## Rendering

Now you can start making your Svelte pages in-place editable by wrapping your design inside the `<Svedit>` component.

```js
<Svedit {doc} path={[doc.document_id]} editable={true} />
```

## Mastering contenteditable

Svedit relies on the contenteditable attribute to make elements editable. The below example shows you
a simplified version of the markup of `<NodeCursorTrap>` and why it is implemented the way it is.

```html
<div contenteditable="true">
  <div class="some-wrapper">
    <!--
      Putting a <br> tag into a div gives you a single addressable cursor position.

      Adding a &ZeroWidthSpace; (or any character) here will lead to 2 cursor
      positions (one before, and one after the character)

      Svedit uses this behavior for node-cursor-traps, and when an
      <AnnotatedTextProperty> is empty.
    -->
    <div class="cursor-trap"><br></div>
    <!--
      If you create a contenteditable="false" island, there needs to be some content in it,
      otherwise it will create two additional cursor positions. One before, and another one
      after the island.

      The Svedit demo uses this technique in `<NodeCursorTrap>` to create a node-cursor
      visualization, that doesn't mess with the contenteditable cursor positions.
    -->
    <div contenteditable="false" class="node-cursor">&ZeroWidthSpace;</div>
  </div>
</div>
```

Further things to consider:

- If you make a sub-tree `contenteditable="false"`, be aware that you can't create a `contenteditable="true"` segment somewhere inside it. Svedit can only work reliably when there's one contenteditable="true" at root (it's set by `<Svedit`>)
- `<AnnotatedString>` and `<CustomProperty>` must not be wrapped in `contenteditable="false"` to work properly.
- Never apply `position: relative` to the direct parent of `<AnnotatedTextProperty>`, it will cause a [weird Safari bug](https://bsky.app/profile/michaelaufreiter.com/post/3lxvdqyxc622s) destroys the DOM.
- Never use an `<a>` tag inside a `contenteditable="true"` element, as it will cause unexpected behavior. Make it a div while editing, and an `<a>` in read-only mode.

## Full API docs?

Not yet. Please just [read the code](./src) for now. It's only a couple of files with less than 3000 LOC in total. The files in `routes` are considered example code (copy them and adapt them to your needs), while files in `lib` are considered library code. Read them to understand the API and what's happening behind the scences.

## Developing Svedit

Once you've cloned the Svedit repository and installed dependencies with `npm install`, start a development server:

```bash
npm run dev
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

## Contributing

At the very moment, the best way to help is to donate or to sponsor us, so we can buy time to work on this exclusively for a couple of more months. Please get in touch personally.

Find my contact details [here](https://editable.website).

## Beta version

It's early. Expect bugs. Expect missing features. Expect the need for more work on your part to make this work for your use case.

## Credits

Svedit led by [Michael Aufreiter](https://michaelaufreiter.com) with guidance and support from [Johannes Mutter](https://mutter.co).
