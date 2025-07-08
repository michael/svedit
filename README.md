# Svedit

Svedit (think Svelte Edit) is a template for building rich content editors with Svelte 5. You can model your content in JSON, render it with custom Svelte components, and edit it directly in the layout.

Try the [demo](https://svedit.vercel.app).

## Principles

**Chromeless canvas:** We keep the canvas chromeless, meaning there's no UI elements like toolbars or menus mingled with the content. You can interact with text directly, but everything else happens via tools are shown in separate overlays or in the fixed toolbar.

**Convention over configuration:** We use conventions and assumptions to reduce configuration code and limit the number of ways something can go wrong. For instance, we assume that a node with a property named `content` of type `string` or `annotated_string` is considered kind `text`, while all other nodes are considered kind `node`. Text nodes have special behavior in the system for editing (e.g. they can be splitted and joined).

## Graph Data Model

Svedit documents are represented in a simple JSON compatible graph data model. A globally addressable space, a huge graph of content nodes if you want. This allows us to share pieces of content not only in the same document, but across multiple documents. E.g. you could share a navigation bar, while still being able to edit it in place (while changes will affect all places they are used).

## Schema definitions

We use a simple JSON-compatible schema definition language, so we can enforce constraints on our documents. E.g. to make sure a page node always has a property body with references to nodes that are allowed within a page.

First off, everything is a node. The page is a node, and so is a paragraph, a list, a list item, a nav and a nav item.

A top-level node that is accessible via a route we internally call a `document` (e.g. a page, event, etc.)

Properties of nodes can hold values:
- `integer`: A number
- `boolean`: true or false
- `string`: A good old JavaScript string
- `string_array`: An array of good old JavaScript strings
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
    content: { type: 'annotated_text' }
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


```js
const raw_doc = [
  {
    id: 'document_nav_item_1',
    type: 'document_nav_item',
    url: '/homepage',
    label: 'Home',
  },
  {
    id: 'nav_1',
    type: 'nav',
    nav_items: ['document_nav_item_1'],
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

## API to read/traverse and write the document graph

```js
const doc = new Document(document_schema, raw_doc);

// get the body (=array of node ids)
const body =  doc.get(['page_1', 'body']); // => ['nav_1', 'paragraph_1', 'list_1']
console.log($state.snapshot(body));
const nav = doc.get(['nav_1']) // => { id: 'nav_1', type: 'nav', nav_items: ['document_nav_item_1'] }
console.log('nav.nav_items before:', $state.snapshot(nav.nav_items));

// Documents need to be changed through transactions, which can consist of one or
// multiple ops that are applied in a single step and undo/redo-able.
const tr = doc.tr;
const new_nav_items = nav.nav_items.slice(0, -1);
tr.set(['nav_1', 'nav_items'], new_nav_items);
doc.apply(tr);
console.log('nav.nav_items after:', $state.snapshot(nav.nav_items));
```

## Selections

Selections are at the heart of Svedit. There are just two types of selections.

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

## Usage

Now you can start making your Svelte pages in-place editable by wrapping your design inside the `<Svedit>` component. The `<AnnotatedStringProperty>` component can be used to render and edit annotated text.

```js
<Svedit {doc} editable={true} class='flex-column'>
  <NodeArrayProperty class="body flex-column gap-y-10" path={[doc.document_id, 'body']}>
    {#snippet node(node, path)}
      {#if node.type === 'story'}
        <Story {path} />
      {:else if node.type === 'list'}
        <List {path} />
      {:else}
        <UnknownNode {path} />
      {/if}
    {/snippet}
  </NodeArrayProperty>
</Svedit>
```

Is there more documentation? No. Just read the code for now. It's only a couple of files with less than 2000LOC in total. Copy and paste it to your app. Change it. This is not an extensive library that tries to cover every possible use-case. This is just a starting point for you to adjust to your needs. Enjoy!

## Developing

Once you've created a project and installed dependencies with `npm install`, start a development server:

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

At the very moment, the best way to help is to donate or sponsor us, so we can buy time to work on this exclusively for a couple of more months. Please get in touch personally.

Find my contact details [here](https://editable.website).


## Alpha version

It's very early. Expect bugs. Expect missing features. Expect the need for more work on your part to make this work for your use case.

## Credits

Svedit is a co-creation of [Michael Aufreiter](https://michaelaufreiter.com) and [Johannes Mutter](https://mutter.co).
