# @svedit/core

The framework-free core of Svedit. It holds everything that does not depend on a UI framework: the document model and schema language, `Session` (state, selection, history), `Transaction`, `Command` and `KeyMapper`, transforms, the paste and HTML export helpers, the DOM selection mapping and clipboard format shared by the editors, and all data types.

You normally don't install this package directly. Each framework package depends on it and re-exports it in full, so every core API is available from the package you already use:

| Framework | Package         | Demo                                         |
| --------- | --------------- | -------------------------------------------- |
| Svelte 5  | `svedit`        | [svedit.dev](https://svedit.dev)             |
| React 19  | `@svedit/react` | [svedit.dev/react](https://svedit.dev/react) |
| Vue 3     | `@svedit/vue`   | [svedit.dev/vue](https://svedit.dev/vue)     |

Install `@svedit/core` on its own when you work with documents outside an editor, for example to validate or transform documents on a server, or to build an integration for another framework.

## Installation

```bash
pnpm add @svedit/core
```

## Usage

```js
import { Session, define_document_schema } from '@svedit/core';

const document_schema = define_document_schema({
	page: {
		kind: 'document',
		properties: {
			body: { type: 'node_array', node_types: ['paragraph'], default_node_type: 'paragraph' }
		}
	},
	paragraph: {
		kind: 'text',
		properties: { content: { type: 'text' } }
	}
});

const session = new Session(
	document_schema,
	{
		document_id: 'page_1',
		nodes: {
			paragraph_1: {
				id: 'paragraph_1',
				type: 'paragraph',
				content: { content: 'Hello', marks: [], annotations: [] }
			},
			page_1: {
				id: 'page_1',
				type: 'page',
				body: { nodes: ['paragraph_1'], marks: [], annotations: [] }
			}
		}
	},
	{}
);

const tr = session.tr;
tr.set(['paragraph_1', 'content'], { content: 'Hello world', marks: [], annotations: [] });
session.apply(tr);

session.undo();
console.log(session.to_json());
```

## Reactivity

A core `Session` is plain JavaScript: state lives in fields, every write notifies a small `Store`, and derived values (`selected_node`, `active_mark`, …) are memoized per change. Framework packages connect it to their reactivity through a `Tracker` (Svelte and Vue) or by subscribing to the store (React). An integration for another framework does the same: pass `{ tracker }` as the fourth `Session` constructor argument, or call `session.subscribe(listener)`.

## Documentation

Svedit is documented once for all frameworks in the [root README](../../README.md): schema, documents, session, transactions, transforms, commands, keymaps, selections, paste and export.

## Credits

Svedit is made by [Michael Aufreiter](https://michaelaufreiter.com) (maintainer) and [Johannes Mutter](https://mutter.co) (design and engineering). Released under the MIT license.
