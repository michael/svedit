# @svedit/vue

Svedit is Editing for Vue 3. It offers structured, full-canvas content editing: model content in JSON, render it with your own Vue components, and **edit it directly in the layout**. This package contains the Vue components, the `v-attach` directive and a `Session` with Vue reactivity on top of the framework-free [`@svedit/core`](../core), which it re-exports in full. Documents, schemas, commands and keymaps are identical to the Svelte and React versions. Try the demo at [svedit.dev/vue](https://svedit.dev/vue).

## Installation

```bash
pnpm add @svedit/vue
```

Import the stylesheet once, next to the editor: `import '@svedit/vue/svedit.css'`.

## Usage

```vue
<script setup>
import { onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { Svedit, Session, KeyMapper } from '@svedit/vue';
import '@svedit/vue/svedit.css';
import { document_schema, doc } from './schema.js';
import { config } from './config.js';

const session = new Session(document_schema, doc, config);
const key_mapper = new KeyMapper();
provide('key_mapper', key_mapper);
const editable = ref(true);

const handle_keydown = (event) => key_mapper.handle_keydown(event);
onMounted(() => window.addEventListener('keydown', handle_keydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handle_keydown));
</script>

<template>
	<Svedit :session="session" :path="[session.doc.document_id]" v-model:editable="editable" />
</template>
```

A node component wraps its content in `<Node>` and renders properties with `<TextProperty>`, `<NodeArrayProperty>` or `<CustomProperty>`; the editor context is available via `inject('svedit')`:

```vue
<script setup>
import { Node, TextProperty } from '@svedit/vue';
defineProps(['path']);
</script>

<template>
	<Node :path="path">
		<TextProperty tag="p" :path="[...path, 'content']" placeholder="Paragraph" />
	</Node>
</template>
```

## Documentation

The schema language, document format, Session and Transaction API, transforms, commands, keymaps, selections, paste and export, and the CSS tokens are documented once for all frameworks in the [root README](../../README.md). It also has a Vue quick start, Vue-specific sections (`inject('svedit')`, `v-model:editable`, slots and render functions for mark components, `v-attach`, scoped styles) and a "Framework differences at a glance" table. The demo in [`src/routes`](./src/routes) is the reference implementation of a complete app: schema, config, toolbar, overlays and node components.

## Credits

Svedit is made by [Michael Aufreiter](https://michaelaufreiter.com) (maintainer) and [Johannes Mutter](https://mutter.co) (design and engineering). Illustrations and icons are hand-crafted by Johannes. Released under the MIT license.
