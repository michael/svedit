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
// Delete the last nav item and store in the graph
const new_nav_items = nav.nav_items.splice(0, -1);
doc.set(['nav_1', 'nav_items'], new_nav_items);
console.log('nav.nav_items after:', $state.snapshot(nav.nav_items));
```



# EARLY DRAFT: Storage in SQLite

The goal is to keep the storage close to the serialization format on the client. You should be able to browse the database manually, and still make sense of the data.

This stores all node data as a JSON blob, along with metadata.

```sql
CREATE TABLE nodes (
    node_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL, -- JSON blob with properties and references
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_nodes_type (type)
);

CREATE TABLE node_links (
    node_link_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    property_name TEXT NOT NULL,
    FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    INDEX idx_relationships_target_node_id (target_node_id)
);

CREATE TABLE document_previews (
    node_id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    INDEX idx_node_previews_updated_at (updated_at)
);
```

`node_links` track the relationships, so we can do reverse lookups as well.

`document_previews` stores and updates snapshots of the document, each time a document gets saved. In the future this could be replaced by a full text search index.

## Open questions and in-progress reflections in no particular order

- ⦿ **Internal links**
  - should we only allow to link to documents (=root nodes)?
  - or should we also expose individual node routes and make them linkable. E.g. link to `story_223e4567e89b12d3a456426614174000`
    > **Comment by M:** I think it makes no sense, as it will feel very technical
    
    > **Comment by J:**
    >
    > I also think we should **not** build custom UI for linking to individual blocks within a document. Only root-level document links should be supported.  Still all Blocks should have an ID and this ID should be also in the DOM, but for other reasons than "author want to link stuff".
    >  
    > Here's why:  If you want to link to something precisely — like a specific paragraph or sentence — you need to **see the full document**.  
    > In a UI like QuickSearch or LinkEditor, you don’t have that context. There’s no space or control to decide *what exactly* you want to link to.  
    >  
    > Adding options like _“Link to this paragraph”_ in that context is confusing and make the UI cluttered.
    >  
    > Precise, in-context linking already exists: browsers support **"Copy link to highlighted text"** in the context menu using [Text Fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments).  
    >  
    > Example: `https://example.com#:~:text=[prefix-,]textStart[,textEnd][,-suffix]` (fuzzy deep links)
    >  
    > Yes, those links are a bit fragile — small changes can break them — but they’re good enough for stable content like blog posts or project pages.  
    >  
    > So if someone *really* wants to deep-link, they should navigate to the exact spot in the document and copy the link from there with the native context menu.
    >  
    > If we decide other some point in the future, e.g. to support deep linking also mobile: we should take a look at how YouTube does it: you copy the timestamp while watching from the share menu.

- ⦿ **Document IDs**
  - we need UUIDs for documents (any node really), so we can create them on the client and be certain they won't collide
  - however those ids will be quite long and lead to urls like `/hello-world-223e4567e89b12d3a456426614174000`
  - Should we store a persistent server-manged sequential id outside the document graph so we can do `/hello-world-23` instead?

    > **Comment by J:**
    > 
    > We only need uniqueness within the scope of a website, since global uniqueness is already covered by the domain — e.g. `example.com/hello-world-23` is globally unique. But this one is fragile if the domain changes.
    > 
    > When creating new blocks or documents on the client, we should assign them a **UUID** immediately to ensure local uniqueness for optimistic editing.
    > 
    > Then, when the data is saved to the server, the backend should assign a **sequential numeric ID** used solely for **user-facing URLs** like `/hello-world-23` to be used in the rest of the internet. In the network of sites that operate on our tool the UUId would be used.
    > 
    > Importantly, we **don’t replace** the UUID — it remains the permanent internal ID, because it ensures stable internal references, allows safe offline creation and stable cross-site linking. The sequential ID is just an additional, human-friendly reference for URLs that are meant to be read/ typed manually.

- ⦿ **Assets & images**
  - aside from the binary file, should we also store image_asset nodes that hold metadata (focus point, dimensions, color info etc.)?
  - if yes an image-asset is a shared node and will be edited from within the document without having to navigate to some global /assets manager
  - challenge here is to make it clear that changes of that user changes of that image_asset node, will update globally, not locally
  - In addition to image_asset we need other nodes like story or a dedicated figure node that render an image_asset (via `<img>`)

    > **Comment by J:**
    > We could follow a similiar approach as with fonts, where the source of truth is within the image file, so e.g. color infos is predicitably derived from the source image file.
    >
    > Nontheless do we need to store data like `focus point, dimensions, dominant colors, ...` outside the image file so we can e.g. render a background color immediately without having to wait for the image file to load or prepare the layout with the image dimensions. Some of this data is also imporant for Image search. So yes, we need an ImageBlock and a separate AssetsTable.
    >
    > Ideally the user has to do no edits at all to the image. For example image title and auditory description should be generated by A.I. Then there's also no local/ global confusion.
    >
    > The only local edit of an image I can think of is "cropping", but also that should not alter the ImageBlock or be part of its metadata, but be part of the layout that is using this ImageBlock as a child, probably not even part of that Block either, but defined in CSS. Unless it's a crop that's not just to adjust focus, but change the meaning of the image. In this case I think we should prompt the user wether to make this change globally or duplicate the asset and then apply on the duplicate.
    > But again, ideally, layout-level crops could be expressed as metadata on the image reference, like:
    > `{ block_ref: 123, crop: { top: 100px, left: 220px, right: 0px, bottom: 0px }}`
    >
    > This keeps the original `ImageBlock` unchanged and ties the crop definition to the block that embeds the image (e.g. `StoryBlock`), not to the asset itself. The crop parameters are then added to the `src` and the cropping is done by the image transforming tool (e.g. wsrv).
    

- ⦿ **Creation of new docs**
  - initial creation needs to happen on the server
  - new docs need to be "cloned" from code-defined templates (EMPTY_PAGE) or existing documents. The cloning mechanism needs to replace all ids of 
  non-shared nodes. It needs to keep shared-nodes and their children (implicitly-shared) untouched including their ids.

  > **Comment by J:** See my comments above to Document IDs: I think it may not be necessary to create docs on the server. If we have UUIDs they could also be created on the client, and the "readable" sequential ID for the URL with slug is then created on save on the server.

- ⦿ **Shared nodes**
  - are not really shared nodes but shared sub-document graphs: e.g. take the nav node which references nav-item nodes (this whole subset is shared)
  - when we want to edit shared nodes we always need to have present the full sub-graph embedded in the current document for editing
  - when you add a shared node to the current document it needs to be fetched from the server including the fully expanded sub-nodes
  - we need to ensure there are no cyclic references while inserting/editing shared nodes or the whole system will blow up

 
  > **Comment by J:**
  > 
  > Also we may want to limit the depth of a document from the start by design.
  >
  > For example:
  >
  > DocumentBlock (level 1) → NavigationBlock (level 2) → NavItemBlock (level 3) → ImageBlock (level 4)*. The ImageBlock used e.g. for the Logo.
  >
  > Another example with less depth:
  >
  > DocumentBlock (level 1) → NavigationBlock (level 2) → NavItemBlockThatAlsoSupportsRefrencesToImageAssets (level 3)
  >
  > Only few Block types could have nested Blocks and it would be strictly limited what Blocktypes are allowed, e.g. a NavigationBlock can never have another NavigationBlock as a child.

- ⦿ **UX challenges with shared nodes**
  - when a shared node is part of a selection with non-shared nodes, and then gets copy&pasted, the user might be confused to end up with parts that are really duplicated, and some that are just referenced multiple times 


- ⦿ **Consequences of including nav/footer in the page**
  - you can no longer share docs independently of the website they are created on: e.g. say you want to download a page for archiving purposes. You can not do that anymore because it wouldn’t function without the other nodes (e.g. those referenced in the nav). Also why would you see the nav if you are intested in that article the user posted)    
  - So we need to question if the nav should be part of the article or a separate document?
  - If they'd be separate documents still nav and page would live in the same node space and reference the same docs. We could even consider editing multiple docs at the same time (e.g. editing the menu and the footer along with the page while still not having to include them in the page. I would find that cleaner to be honest. But let's compare the two appraoches:
    - nav+footer is part of the page (one doc)
      - PRO: easier to handle the editing session (just one doc)
      - PRO: you have more freedom where to place your menu/footer
      - CON: you can not do any special treatment to the menu, you need to assume there can be 0,1 or many instances of the same menu. How would 3 references of the menu in one page translate to a mobile menu for instance?
    - nav, footer and page are separate
      - PRO: clear scope: the page's content can be viewed independently of global stuff like menu and footer
      - PRO: fixed places for menu and footer
      - PRO: still use the same graph data model
      - PRO: more freedom for rendering (e.g. in view mode render a mobile menu that is sticky)
      - CON: we may need a multi-doc editing session or make a mode switcher (either edit the doc, the menu or the footer).

    --- 
    
    > **Comment by J:**
    >
    > My main goal is: Unified Editing Flow (WYSIWYG) for all content: Authors can edit everything in one go. No context switching.
    > 
    > I think we do nothing wrong when (first) NOT building specific concepts for Toplevel Navigation and Footer. Essentially we approach it with a mindset there is no "Navigation", there is no "Footer". And then we "hack" the experience by using a shared LinksBlock. If we realise there are some UX quirks, we can still decide to have dedicated concepts for navigation and footer. We will not loose any development hours with this approach. 
    > 
    > When you treat Nav and Footer as any other Block Type and as part of the document you get:
    > - a super simple interface and only one concept the user needs to understand: **Point and Edit**. No modalities. No obfuscated settings. No "visualisations" because you edit out of context.
    > - implementation is easier too (no special treatment, no extra work except for a simple LinksBlock, which is necessary regardless of toplevel nav and footer).
    > - users can choose to **not have a** navigation / footer on a page
    > - **encourages non-traditional page compositions:** when users create a new website from scratch they don't have to deal with navigation and footer first, but focus on your clean canvas instead, no distractions. Because the "outset" is different, you can get to results that you'd have never considered otherwise. And you get there faster. You are not preconditioned to think in terms of "nav", then "body", then "footer". 
    > - you can use the Navigation Block not just as the classic top level page navigation, but as _in-doc_ Table of Contents, or Link List to external sources, or really anything. 
    > - you can place it anywhere. e.g. have two rows of navigation, have the logo/ a cover placed above in an ImageBlock, add an AnnouncmentBlock on top to emphasise some news ... All of these examples are extremly complicated to do if you don't have a single editing container and they will lead to tons of edge cases.
    > - in case of a one page navigation or in case of a table of contents style nav, the navigation **is an important part** of the document, you also want it to be part when exporting. But even in case of a multi page setup, why would one want to strip the Navigation when exporting? It provides important context, it includes the site name/ logo, it makes the broader context discoverable. I think it helps here to change perspective and see the top navigation as a type of print-style "document header" and the bottom navigation as the "document footer".
    > - In case you have three navigations on a page, they would be all be part of the mobile menu, as we do now already with the footer, which is also included in the mobile menu.
    > - A NavigationBlock will have different layouts that serve different purposes ("horizontal menu bar layout", "table of contents layout", "footer layout", ...). This layout identifier will give us sufficient information on how to display e.g. in the mobile menu (e.g. smaller or larger font).
    > - Even sticky navigation gets easier, since all the navigations are part of the same top level DOM element. When you scroll down and a new sticky navigation gets scrolled to the top edge it will replace the previous one, without any css magic. This is greater for longer pages and _scrolly-telling_.
    >
    > **Challenges**:
    > - Make shared Blocks visually distinct (e.g. different selection border like in Figma: regular frames vs. component frames, show a badge that you’re editing a shared block)
    > - How do we make sure the main navigation is not accidently deleted or not added in docs? How do we make adding/ removing NavigationBlocks intentional?
    >   - Could there be some slots like `header`, `main` and `footer`? And editing stuff in `header` is designed to be more "safe" (e.g. locked)?
    > - When you create a new page via "+" (not via duplicate), you want it to e.g. include from the start the navigation block that was used on the majority of all the other pages. There're several ways to solve this:
    >   - a) PageTemplates: users define a common structure. The UI for the "new page/doc" route asks the user wether to start from scratch or build from a template.
    >   - b) Smart Autocomplete: The editor smartly suggests to insert certain block types at the current root container cursor position, e.g. with heuristics: `typically at position 1 in 90% of all documents the shared block 123 is present`.
    >   - c) Dumb autocomplete: The Block has a property that says "insert_by_default_in_new_docs: true" (the "new_doc" function then fetches any block that has this property and inserts it as shared block).
    > - Will Svelte re-render blocks like the NavigationBlock that appear (at the same position) in different sub routes or does it smartly compare the differences in the root Svedit JSON and only re-render what changed?



## Crazy ideas for the future

What motivates me most about the nodes in a global graph data structure is, that potentially you could look at that that graph even more globally than one site. Every node, including every document entry point has a UUID, so you could actually link to content on other sites using the UUID. If we had a lookup uuid to resource url (`some-domain.com/223e4567e89b12d3a456426614174000`) that is shared across all sites of the global network of compatible sites you could introduce links to documents that would even survive when a person changes their domain. Not a trivial problem to keep that lookup index in sync and small enough, but it can be done, maybe as a distributed index to save space, sort of like a Napster for websites. Anyways, this is far-far future stuff, but it could become very very interesting one day.

> **Comment by J:**
> That would be awesome. Yes, for cross-website linking we probably want to use the UUID instead of `example.com/slug-123` so it's resolvale even if the domain changes and even if the entire website disappears, because the particular subgraph that's linked to has been quoted on another site and been indexed ("many copies keep things safe"). There could be IndexingServers that get notified on every Block Update and store the UIID with some concise search meta data and a first_time_indexed_at_date_on_site property, so it's clear who the very first author was.

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
