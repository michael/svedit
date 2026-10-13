# svedit

Svedit is Editing for Svelte 5. It offers structured, full-canvas content editing: model content in JSON, render it with your own Svelte components, and **edit it directly in the layout**. This package contains the Svelte components and a `Session` with Svelte reactivity on top of the framework-free [`@svedit/core`](../core), which it re-exports in full. Try the [Svedit demo](https://svedit.dev) or [Editable](https://editable.website), a website builder built on it.

## Installation

```bash
pnpm add svedit
```

The styles ship inside the components; no stylesheet import is needed. For a running starting point, clone the [hello-svedit](https://github.com/michael/hello-svedit) template.

## Usage

```svelte
<script>
	import { setContext } from 'svelte';
	import { Svedit, Session, KeyMapper } from 'svedit';
	import { document_schema, doc } from './schema.js';
	import { config } from './config.js';

	const session = new Session(document_schema, doc, config);
	const key_mapper = new KeyMapper();
	setContext('key_mapper', key_mapper);
	let editable = $state(true);
</script>

<svelte:window onkeydown={(event) => key_mapper.handle_keydown(event)} />
<Svedit {session} path={[session.doc.document_id]} bind:editable />
```

A node component wraps its content in `<Node>` and renders properties with `<TextProperty>`, `<NodeArrayProperty>` or `<CustomProperty>`; the editor context is available via `getContext('svedit')`:

```svelte
<script>
	import { Node, TextProperty } from 'svedit';
	let { path } = $props();
</script>

<Node {path}>
	<TextProperty tag="p" path={[...path, 'content']} placeholder="Paragraph" />
</Node>
```

## Documentation

The schema language, document format, Session and Transaction API, transforms, commands, keymaps, selections, paste and export, and the CSS tokens are documented once for all frameworks in the [root README](../../README.md). It also has a Svelte quick start and a "Framework differences at a glance" table. The demo in [`src/routes`](./src/routes) is the reference implementation of a complete app: schema, config, toolbar, overlays and node components.

## Credits

Svedit is made by [Michael Aufreiter](https://michaelaufreiter.com) (maintainer) and [Johannes Mutter](https://mutter.co) (design and engineering). Illustrations and icons are hand-crafted by Johannes. Released under the MIT license.
