# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace note

This package is part of the svedit workspace (see the root `CLAUDE.md`). The framework-free parts of the
editor (Session logic, Transaction, Command, document utilities, transforms, paste/export, data types) live in
`packages/core` (npm `@svedit/core`) and are re-exported from this package's `src/lib/index.ts`. Only components,
the Session subclass with this framework's reactivity, the glue installing the core visibility registry and element attachments
live here. The editor's event handling (`CanvasController`), the visibility registry and the render helpers (`rendering.ts`)
come from core; components only wire them to this framework's reactivity.

## Commands

**Development:**

- `pnpm dev` - Start development server
- `pnpm build` - Build the demo site for production
- `pnpm build:lib` - Build the library (dist/index.js, dist/svedit.css, type declarations)
- `pnpm preview` - Preview production build

**Testing:**

- `pnpm test:unit` - Run browser tests with Vitest in watch mode
- `pnpm test` - Run the browser tests once
- `pnpm check` - Type-check with tsc

**Testing Guidelines:**

- DO NOT run tests automatically (test:unit, test, etc.)
- The user prefers to run all tests manually
- Focus on implementing code changes and let the user handle testing
- DO NOT start the dev server or drive the app in a browser (preview tools, screenshots, etc.) to verify changes — in-browser verification is done manually by the user
- Static checks are fine: `pnpm build` and `pnpm check` may be used to verify that changes compile

**Implementation Guidelines:**

- Do exactly what the user asks for - one step at a time
- Do NOT think 4 steps ahead or add extra features/improvements
- Only implement the specific change requested
- You can suggest what the next step could be, but don't implement it

**Refactoring Guidelines:**

- During refactors, make ONLY the minimal changes needed (e.g., renaming APIs)
- Do NOT "improve" or restructure logic while refactoring
- If you see something that could be improved, note it separately for a future task
- Refactoring and improving are two separate activities - never combine them

**Code Style:**

- Use snake_case for all variable names, function names, and identifiers
- This applies to JavaScript/TypeScript code, test files, and any new code written

**What to NOT change (keep camelCase):**

- `window.getSelection()` - native API
- `document.activeElement` - native API
- `navigator.clipboard` - native API
- `addEventListener` - native API
- `preventDefault()` - native API
- `stopPropagation()` - native API
- `getRangeAt()` - native API
- Solid APIs: `createSignal`, `createMemo`, `createEffect`, `onMount`, `onCleanup`, `splitProps`, `mapArray`, etc.
- Solid components and JSX attributes: `Show`, `For`, `Dynamic`, `onClick`, `onPointerDown`, `classList`, etc.
- DOM properties: `innerHTML`, `textContent`, `nodeType`, etc.

**Pattern**: If it's a web platform API or Solid API, keep camelCase. If it's our custom variable/function name, use snake_case.

**Component authoring:**

- Components are function components in `.tsx` files with colocated `.css` files (copies of the React ones; `pnpm lint:styles` checks them). There are no scoped styles: qualify selectors with a component-specific class instead.
- Never destructure props. Use `splitProps` and read `props.x` inside JSX, `createMemo` or `createEffect`, so reads stay reactive.
- Components whose DOM is read by the selection mapping (TextProperty, NodeArrayProperty, Node, CustomProperty, NodeGapMarkers) render their children as the element's only child expression, a flat array. Solid then inserts no placeholder nodes; a dynamic expression next to static siblings that becomes empty leaves an empty text node behind. Inside the canvas, prefer class or style toggles over `<Show>` in node markup.
- `NodeArrayProperty` renders one keyed list (`mapArray` over cached entry objects): a node keeps its DOM across inserts, deletes and moves of its siblings. Positional inputs (index, path, mark, annotations) are derived from the current layout by key, never written into signals.
- Context is resolved through the owner tree when a computation is created. Create child lists (`mapArray` memos) inside the `<Context.Provider>` they need, not in the component body, or the children won't see it (see `NodeArrayProperty`).
- Element lifecycle hooks use `attach(el, key, create_attachment)` (`src/lib/attach.ts`) from a `ref` callback, the equivalent of Svelte's `{@attach}`. It runs in an effect, after the element is in the document, and re-runs when the key changes.
- Reactive state lives in plain fields on `Session`; the binding's tracker (`src/lib/reactivity.ts`) keeps one signal per field, so reading `session.doc` in a reactive scope subscribes to it. The editor context is a stable object whose fields are getters over signals; get it with `use_svedit()`. Document and selection values are plain objects; never hand the session a `createStore` proxy.
- `editable` is a prop plus `on_editable_change` (controlled) or managed by the editor when omitted, like the React binding.

**Documentation Style:**

- Use sentence case for all headings in documentation (README.md, etc.)
- Use sentence case for code comments
- Sentence case means: capitalize only the first word and proper nouns
- **Exception**: "Svedit" is always capitalized as it's a proper noun (the product name)
- Examples:
  - ✓ "Getting started" (not "Getting Started")
  - ✓ "Why Svedit?" (not "Why svedit?") - Svedit is a proper noun
  - ✓ "Developing Svedit" (not "Developing svedit") - Svedit is a proper noun
  - ✓ "Document-scoped commands" (not "Document-Scoped Commands")
  - ✓ "Create a new user" (not "Create a New User")
  - ✓ "API reference" (not "API Reference")
- This applies to: markdown headings, JSDoc comments, inline comments, commit messages

## Architecture

Svedit is a rich content editor template built with SolidJS that uses a graph-based data model. It is a 1:1 port of the Svelte original and shares its document format.

### Core Components

**Document Model:**

- `Session` - Central document class with state management, transactions, and history
- `Transaction` - Handles atomic operations on the document
- Documents are represented as graphs of nodes with properties and references

**Selection System:**

- Supports text, node, and property selections
- Maps between internal selection model and DOM selection
- Handles complex selection scenarios like backwards selections and multi-node selections

**Key Components:**

- `Svedit.tsx` - Main editor component with event handling and selection management
- `NodeArrayProperty.tsx` - Renders containers that hold sequences of nodes
- `Node.tsx` - Wrapper component for document nodes that handles node gap placement and viewport culling
- `TextProperty.tsx` - Handles text rendering and editing with inline annotations
- Node components (`Story`, `List`, etc.) - Render specific content types

### Schema System

Content is defined through schemas that specify:

- Node types and their properties
- Property types: `string`, `integer`, `boolean`, `string_array`, `text`, `node`, `node_array`
- Reference relationships between nodes
- Default types and optional annotation types for node arrays

### Data Flow

1. Raw document data is loaded into `Session`
2. Changes are made through transactions for undo/redo support
3. Selection state is synchronized between internal model and DOM
4. Components render content based on document state and schema definitions, reading session fields inside reactive scopes
