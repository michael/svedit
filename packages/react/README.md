# @svedit/react

Svedit is Editing for React 19. It offers structured, full-canvas content editing: model content in JSON, render it with your own React components, and **edit it directly in the layout**. This package contains the React components, hooks (`useSvedit`, `useNode`, `useSveditContext`, `useSnapshot`, `useVersion`, `useAttach`) and a snapshot-based store on top of the framework-free [`@svedit/core`](../core), which it re-exports in full. Documents, schemas, commands and keymaps are identical to the Svelte and Vue versions. Try the demo at [svedit.dev/react](https://svedit.dev/react).

## Installation

```bash
pnpm add @svedit/react
```

Import the stylesheet once, next to the editor: `import '@svedit/react/svedit.css'`.

## Usage

```jsx
import { useEffect, useState } from 'react';
import { Svedit, Session, KeyMapper, KeyMapperContext } from '@svedit/react';
import '@svedit/react/svedit.css';
import { document_schema, doc } from './schema.js';
import { config } from './config.js';

export default function App() {
	const [session] = useState(() => new Session(document_schema, doc, config));
	const [key_mapper] = useState(() => new KeyMapper());
	const [editable, set_editable] = useState(true);

	useEffect(() => {
		const handle_keydown = (event) => key_mapper.handle_keydown(event);
		window.addEventListener('keydown', handle_keydown);
		return () => window.removeEventListener('keydown', handle_keydown);
	}, [key_mapper]);

	return (
		<KeyMapperContext.Provider value={key_mapper}>
			<Svedit
				session={session}
				path={[session.doc.document_id]}
				editable={editable}
				on_editable_change={set_editable}
			/>
		</KeyMapperContext.Provider>
	);
}
```

A node component wraps its content in `<Node>` and renders properties with `<TextProperty>`, `<NodeArrayProperty>` or `<CustomProperty>`; read node data with `useNode(path)` and editor state with `useSvedit((ctx) => ...)`:

```jsx
import { Node, TextProperty } from '@svedit/react';

export default function Paragraph({ path }) {
	return (
		<Node path={path}>
			<TextProperty tag="p" path={[...path, 'content']} placeholder="Paragraph" />
		</Node>
	);
}
```

## Documentation

The schema language, document format, Session and Transaction API, transforms, commands, keymaps, selections, paste and export, and the CSS tokens are documented once for all frameworks in the [root README](../../README.md). It also has a React quick start, React-specific sections (reading session state, the editor context, `className`, `children`, `useAttach`) and a "Framework differences at a glance" table. The demo in [`src/routes`](./src/routes) is the reference implementation of a complete app: schema, config, toolbar, overlays and node components.

## Credits

Svedit is made by [Michael Aufreiter](https://michaelaufreiter.com) (maintainer) and [Johannes Mutter](https://mutter.co) (design and engineering). Illustrations and icons are hand-crafted by Johannes. Released under the MIT license.
