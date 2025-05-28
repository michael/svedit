# Svedit

Svedit (think Svelte Edit) is a template for building rich content editors with Svelte 5. You can model your content in JSON, render it with custom Svelte components, and edit it directly in the layout.

Try the [demo](https://svedit.vercel.app).

## WIP: New Document Graph Data Model

This branch is a huge work in progress. There's not so much visible progress for Svedit since the initial public release in October. The reason is that we realized a self-contained piece of JSON to be edited is not enough to serve our needs. We want to edit pieces of content that are shared across documents. That's why we switching to a graph data model, where all content lives in a globally addressable space, a huge graph of content nodes if you want. This way we can share pieces of content (e.g. nav or footer or a table) across multiple documents, while still being able to edit them in place (but changes will affect all places they are used).

We also want to include an SQLite data storage layer, so you can create new documents and update them in a single request (respecting shared nodes too).

## Schema definitions

We want to have a simple schema definition language, so we can enforce constraints on our documents. E.g. to make sure a page node always has a property body with references to blocks that are allowed within a page.

First off, everything is a node. The page is a node, and so is a paragraph, a list, a list item, a nav and a nav item.

A top-level node that is accessible via a route we internally call a `document` (e.g. a page, event, etc.)

Properties of nodes can hold values:
- `integer`
- `boolean`
- `string`
- `string-array`
- `annotated-text`: a plain text string, but with annotations (bold, italic, link etc.)

Or references:
- `ref`: References a single node (e.g. an image node can reference a global asset node)
- `multiref`: References a sequence of nodes (e.g. page.body references pargraph and list nodes)


```js
const doc_schema = {
  page: {
    body: {
      type: 'multiref',
      ref_types: ['nav', 'paragraph', 'list', 'footer'],
      default_ref_type: 'paragraph',
    }
  },
  paragraph: {
    content: { type: 'annotatd-text' }
  },
  list: {
    list_items: {
      type: 'multiref',
      ref_types: ['list_item'],
      default_ref_type: 'list_item',
    }
  },
  nav: {
    nav_items: {
      type: 'container',
      ref_types: ['document_nav_item'],
      default_ref_type: 'document_nav_item',
    }
  },
  nav_item: {
    // we could make this type: 'ref' but then we'd fetch all nodes of each document referenced in the nav
    // so we keep this a dumb integer at first, but maybe we can introduce some weakref or previewref mechanism that only fetches a preview from the document graph (not sure previews should be owned by the document graph though)
    document_id: { type: 'integer' },
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
    document_id: 'page_1',
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
const doc = new SveditDoc(doc_schema, raw_doc);

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



## Usage 

Now you can start making your Svelte pages in-place editable by wrapping your design inside the `<Svedit>` component. The `<Text>` component can be used to render and edit annotated text.

```js
<Svedit {doc} editable={true} class='flex-column'>
  <Container class="body flex-column gap-y-10" path={[doc.doc_id, 'body']}>
    {#snippet block(block, path)}
      {#if block.type === 'story'}
        <StoryBlock {path} />
      {:else if block.type === 'list'}
        <ListBlock {path} />
      {:else}
        <UnknownBlock {path} />
      {/if}
    {/snippet}
  </Container>
</Svedit>
```

Is there more documentation? No. Just read the code (it's only a couple of files with less than 1500LOC in total), copy and paste it to your app. Change it. This is not a library that tries to cover every possible use-case. This is just a starting point for you to adjust to your needs. Enjoy!

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
