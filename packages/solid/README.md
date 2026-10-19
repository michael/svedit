# @svedit/solid

Svedit is Editing for SolidJS. It offers structured, full-canvas content editing: model content in JSON, render it with your own Solid components, and **edit it directly in the layout**. This package contains the Solid components, the `attach` helper and a `Session` with Solid reactivity on top of the framework-free [`@svedit/core`](../core), which it re-exports in full. Documents, schemas, commands and keymaps are identical to the Svelte, React and Vue versions. Try the demo at [svedit.dev/solid](https://svedit.dev/solid).

## Installation

```bash
pnpm add @svedit/solid
```

Import the stylesheet once, next to the editor: `import '@svedit/solid/svedit.css'`.

## Usage

```tsx
import { createSignal, onCleanup, onMount } from 'solid-js';
import { Svedit, Session, KeyMapper, KeyMapperContext } from '@svedit/solid';
import '@svedit/solid/svedit.css';
import { document_schema, doc } from './schema.js';
import { config } from './config.js';

export default function App() {
	const session = new Session(document_schema, doc, config);
	const key_mapper = new KeyMapper();
	const [editable, set_editable] = createSignal(true);

	const handle_keydown = (event: KeyboardEvent) => key_mapper.handle_keydown(event);
	onMount(() => window.addEventListener('keydown', handle_keydown));
	onCleanup(() => window.removeEventListener('keydown', handle_keydown));

	return (
		<KeyMapperContext.Provider value={key_mapper}>
			<Svedit
				session={session}
				path={[session.doc.document_id]}
				editable={editable()}
				on_editable_change={set_editable}
			/>
		</KeyMapperContext.Provider>
	);
}
```

A node component wraps its content in `<Node>` and renders properties with `<TextProperty>`, `<NodeArrayProperty>` or `<CustomProperty>`; the editor context is available via `use_svedit()`. Read props lazily (`props.path`), never destructure them:

```tsx
import { Node, TextProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';

export default function Paragraph(props: NodeComponentProps) {
	return (
		<Node path={props.path}>
			<TextProperty tag="p" path={[...props.path, 'content']} placeholder="Paragraph" />
		</Node>
	);
}
```

Session fields are tracked: reading `session.doc`, `session.selection` or `session.get(path)` inside JSX, `createMemo` or `createEffect` re-runs exactly when that field changes.

## Documentation

The schema language, document format, Session and Transaction API, transforms, commands, keymaps, selections, paste and export, and the CSS tokens are documented once for all frameworks in the [root README](../../README.md). It also has a Solid quick start and a "Framework differences at a glance" table. The demo in [`src/routes`](./src/routes) is the reference implementation of a complete app: schema, config, toolbar, overlays and node components.

## Credits

Svedit is made by [Michael Aufreiter](https://michaelaufreiter.com) (maintainer) and [Johannes Mutter](https://mutter.co) (design and engineering). Illustrations and icons are hand-crafted by Johannes. Released under the MIT license.
