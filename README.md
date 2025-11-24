# Svedit

Svedit (think Svelte Edit) is a a tiny library for building editable websites in Svelte. You can model your content in JSON, render it with custom Svelte components, and edit it directly in the layout.

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

**Convention over configuration:** We use conventions and assumptions to reduce configuration code and limit the number of ways something can go wrong. For instance, we assume that a node with a property named `content` of type `annotated_text` is considered kind `text`, while all other nodes are considered kind `node`. Text nodes have special behavior in the system for editing (e.g. they can be splitted and joined).

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
- `annotated_text`: a plain text string, but with annotations (bold, italic, link etc.)

Or references:
- `node`: References a single node (e.g. an image node can reference a global asset node)
- `node_array`: References a sequence of nodes (e.g. page.body references paragraph and list nodes)


```js
const document_schema = {
  page: {
    kind: 'document',
    properties: {
      body: {
        type: 'node_array',
        node_types: ['nav', 'paragraph', 'list'],
        default_node_type: 'paragraph',
      }
    }
  },
  paragraph: {
    kind: 'text',
    properties: {
      content: { type: 'annotated_text', allow_newlines: true }
    }
  },
  list_item: {
    kind: 'text',
    properties: {
      content: { type: 'annotated_text', allow_newlines: true },
    }
  },
  list: {
    kind: 'block',
    properties: {
      list_items: {
        type: 'node_array',
        node_types: ['list_item'],
        default_node_type: 'list_item',
      }
    }
  },
  nav: {
    kind: 'block',
    properties: {
      nav_items: {
        type: 'node_array',
        node_types: ['nav_item'],
        default_node_type: 'nav_item',
      }
    }
  },
  nav_item: {
    kind: 'block',
    properties: {
      url: { type: 'string' },
      label: { type: 'string' },
    }
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
    text: function(tr, content = {text: '', annotations: []}, layout = 1) {
      const new_text = {
   			id: nanoid(),
   			type: 'text',
        layout,
   			content
  		};
      tr.create(new_text);
  		tr.insert_nodes([new_text.id]);
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

## Commands API

Commands provide a structured way to implement user actions. Commands are stateful and UI-aware, unlike transforms which are pure functions.

There are two types of commands in Svedit:
- **Document-scoped commands** - Bound to a specific Svedit instance/document and only active when that editor has focus
- **App-level commands** - Operate at the application level, independent of any specific document

Let's start with document-scoped commands, which are the foundation of the editing experience.

### Document-scoped commands

Document-scoped commands operate on a specific document and have access to its selection, content, and editing state through a context object.

#### Creating a document-scoped command

Extend the `Command` base class and implement the `is_enabled()` and `execute()` methods:

```js
import Command from 'svedit';

class ToggleBoldCommand extends Command {
  is_enabled() {
    return this.context.editable && this.context.doc.selection?.type === 'text';
  }

  execute() {
    this.context.doc.apply(this.context.doc.tr.annotate_text('bold'));
  }
}
```

#### Document command context

Document-scoped commands receive a `context` object with access to the Svedit instance state:

- `context.doc` - The current document instance
- `context.editable` - Whether the editor is in edit mode
- `context.canvas` - The DOM element of the Svedit editor canvas
- `context.is_composing` - Whether IME composition is currently taking place

### Command lifecycle methods

**`is_enabled(): boolean`**

Determines if the command can currently be executed. This is automatically evaluated and exposed as the `disabled` derived property, which can be used to disable UI elements.

```js
is_enabled() {
  return this.context.editable && this.context.doc.selection?.type === 'text';
}
```

**`execute(): void | Promise<void>`**

Executes the command's action. Can be synchronous or asynchronous.

```js
execute() {
  const tr = this.context.doc.tr;
  tr.insert_text('Hello');
  this.context.doc.apply(tr);
}
```

#### Built-in document commands

Svedit provides several core commands out of the box:

- `UndoCommand` - Undo the last change
- `RedoCommand` - Redo the last undone change
- `SelectParentCommand` - Select the parent of the current selection
- `ToggleAnnotationCommand` - Toggle text annotations (bold, italic, etc.)
- `AddNewLineCommand` - Insert newline character in text
- `BreakTextNodeCommand` - Split text node at cursor
- `SelectAllCommand` - Progressively expand selection
- `InsertDefaultNodeCommand` - Insert a new node at cursor

#### Using document commands

Commands are created by passing them a context object from the Svedit component. See a complete example in [`src/routes/create_demo_doc.js`](src/routes/create_demo_doc.js) in the `create_commands_and_keymap` configuration function:

```js
create_commands_and_keymap: (context) => {
  const commands = {
    undo: new UndoCommand(context),
    redo: new RedoCommand(context),
    toggle_strong: new ToggleAnnotationCommand('strong', context),
    toggle_emphasis: new ToggleAnnotationCommand('emphasis', context),
    // ... more commands
  };

  const keymap = define_keymap({
    'meta+z,ctrl+z': [commands.undo],
    'meta+b,ctrl+b': [commands.toggle_strong],
    // ... more keybindings
  });

  return { commands, keymap };
}
```

Bind commands to UI elements in your components:

```svelte
<button 
  disabled={document_commands.bold.disabled}
  class:active={document_commands.bold.active}
  onclick={() => document_commands.bold.execute()}>
  Bold
</button>
```

#### Derived state in commands

Commands can have derived state for reactive UI binding. The `active` property in toggle commands is a common pattern:

```js
class ToggleItalicCommand extends Command {
  // Automatically recomputes when annotation state changes
  active = $derived(this.context.doc.active_annotation('italic'));

  is_enabled() {
    return this.context.editable && this.context.doc.selection?.type === 'text';
  }

  execute() {
    this.context.doc.apply(this.context.doc.tr.annotate_text('italic'));
  }
}
```

The `disabled` property is automatically derived from `is_enabled()` on all commands.


#### DOM access in commands

Commands can access the DOM through the context or global APIs:

```js
class CopyCommand extends Command {
  is_enabled() {
    return this.context.doc.selection !== null;
  }

  async execute() {
    const text = this.context.doc.get_selected_text();
    await navigator.clipboard.writeText(text);
    
    // Access the editor canvas
    this.context.canvas.classList.add('copy-feedback');
  }
}
```

### App-level commands and scope hierarchy

While document-scoped commands operate on a specific Svedit instance, app-level commands operate at the application level and handle concerns like saving, loading, switching between edit/view modes, or managing multiple documents.

#### Understanding the scope stack

Svedit uses a scope hierarchy (scope stack) to manage which commands are active at any given time:

1. **App-level scope** (top level) - Commands that are always available, independent of document focus
2. **Document-level scope** (per Svedit instance) - Commands bound to a specific document/editor

When a Svedit instance gains focus:
- The previous document's scope is **popped** from the stack (its commands become inactive)
- The newly focused document's scope is **pushed** onto the stack (its commands become active)

This means commands automatically work with the correct document based on focus.

#### Creating app-level commands

App-level commands have their own context, separate from any specific document:

```js
import Command from 'svedit';

class SaveCommand extends Command {
  is_enabled() {
    return this.context.editable;
  }

  async execute() {
    await this.context.save_all_documents();
    this.context.show_notification('All changes saved');
  }
}

class ToggleEditModeCommand extends Command {
  is_enabled() {
    return !this.context.editable;
  }

  execute() {
    this.context.editable = true;
  }
}
```

#### App-level context

The app-level context contains application-wide state and methods:

```js
const app_context = {
  get editable() {
    return editable; // App-level editable state
  },
  set editable(value) {
    editable = value;
  },
  get doc() {
		return doc;
	},
	get app_el() {
		return app_el;
	}
};

const app_commands = {
  save: new SaveCommand(app_context),
  toggle_edit: new ToggleEditCommand(app_context)
};
```

## Scope-aware Keyboard Shortcuts

The KeyMapper manages keyboard shortcuts using a scope-based stack system. Scopes are tried from top to bottom (most recent to least recent), allowing more specific keymaps to override general ones.

### Basic usage

```js
import { KeyMapper, define_keymap } from 'svedit';

const key_mapper = new KeyMapper();

// Define a keymap
const keymap = define_keymap({
  'meta+z,ctrl+z': [document_commands.undo],
  'meta+b,ctrl+b': [document_commands.bold],
  'enter': [document_commands.break_text_node]
});

// Push the keymap onto the scope stack
key_mapper.push_scope(keymap);

// Handle keydown events
window.addEventListener('keydown', (event) => {
  key_mapper.handle_keydown(event);
});
```

### Key syntax

- **Multiple modifiers**: `meta+shift+z`, `ctrl+alt+k`
- **Cross-platform**: `meta+z,ctrl+z` (tries Meta+Z first, then Ctrl+Z)
- **Modifiers**: `meta`, `ctrl`, `alt`, `shift`
- **Keys**: Any key name (e.g., `a`, `enter`, `escape`, `arrowup`)

### Command arrays

Commands are wrapped in arrays to support fallback behavior:

```js
define_keymap({
  'meta+b,ctrl+b': [
    document_commands.bold,      // Try this first
    document_commands.fallback   // Use this if first is disabled
  ]
});
```

### Scope stack

Use `push_scope()` and `pop_scope()` to manage different keyboard contexts:

```js
// App-level keymap (always active)
const app_keymap = define_keymap({
  'meta+s,ctrl+s': [app_commands.save],
  'meta+n,ctrl+n': [app_commands.new_document]
});
key_mapper.push_scope(app_keymap);

// Document-level keymap (active when editor has focus)
const doc_keymap = define_keymap({
  'meta+z,ctrl+z': [document_commands.undo],
  'meta+b,ctrl+b': [document_commands.bold]
});

// When editor gains focus:
key_mapper.push_scope(doc_keymap);

// When editor loses focus:
key_mapper.pop_scope();
```

The KeyMapper tries scopes from top to bottom, so push more specific keymaps last.


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

You can access the current selection through `doc.selection` anytime. And you can programmatically set the selection using `doc.selection = new_selection`.

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

      Using <wbr> will make it only addressable for ArrowLeft and ArrowRight, but not ArrowUp and ArrowDown.
      And using <span></span> will not make it addressable at all.

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
- `<AnnotatedTextProperty>` and `<CustomProperty>` must not be wrapped in `contenteditable="false"` to work properly.
- Never apply `position: relative` to the direct parent of `<AnnotatedTextProperty>`, it will cause a [weird Safari bug](https://bsky.app/profile/michaelaufreiter.com/post/3lxvdqyxc622s) to destroy the DOM.
- Never use an `<a>` tag inside a `contenteditable="true"` element, as it will cause unexpected behavior. Make it a `<div>` while editing, and an `<a>` in read-only mode.

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

It's still early. Expect bugs. Expect missing features. Expect the need for more work on your part to make this fit for your use case.

## Credits

Svedit is led by [Michael Aufreiter](https://michaelaufreiter.com) with guidance and support from [Johannes Mutter](https://mutter.co).
