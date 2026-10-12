# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace note

This package is part of the svedit workspace (see the root `CLAUDE.md`). The framework-free parts of the
editor (Session logic, Transaction, Command, document utilities, transforms, paste/export, data types) live in
`packages/core` (npm `@svedit/core`) and are re-exported from this package's `src/lib/index.ts`. Only components,
the Session subclass with this framework's reactivity, node visibility and element attachments live here.

## Commands

**Development:**

- `pnpm dev` - Start development server
- `pnpm build` - Build the demo site for production
- `pnpm build:lib` - Build the library (dist/index.js, dist/svedit.css, type declarations)
- `pnpm preview` - Preview production build

**Testing:**

- `pnpm test:unit` - Run browser tests with Vitest in watch mode
- `pnpm test` - Run the browser tests once
- `pnpm check` - Type-check with vue-tsc

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
- Vue APIs: `defineProps`, `onMounted`, `shallowRef`, `watchEffect`, etc.
- Vue event handler props in render functions: `onMousedown`, `onChange`, etc.
- DOM properties: `innerHTML`, `textContent`, `nodeType`, etc.

**Pattern**: If it's a web platform API or Vue API, keep camelCase. If it's our custom variable/function name, use snake_case.

**Component authoring:**

- Components whose DOM is read by the selection mapping (TextProperty, NodeArrayProperty, Node, CustomProperty, NodeGapMarkers, node-array mark wrappers such as Section) are written with render functions, not templates. Vue templates wrap `v-for`, `v-if` and `<slot />` output in fragments whose anchor nodes (empty text nodes, `<!--v-if-->` comments) would otherwise land inside the contenteditable canvas. Keep it that way.
- Element lifecycle hooks use the `v-attach` directive (`src/lib/attach.ts`), the equivalent of Svelte's `{@attach}`.
- Reactive class state (Session, Command) lives in `shallowRef`/`computed` fields exposed through getters. Document and selection values are plain objects, never deep proxies: the Vue `Session` unwraps `reactive()` proxies (deeply, for transaction values and selections) before storing anything.
- Node components must root at `<Node>` (or declare `mark` and `annotations` props): `NodeArrayProperty` passes both to every child, and on a plain-element root Vue's attribute fallthrough would render them as `mark="[object Object]"`.
- Inside the canvas, avoid `v-if` on elements of a node's template (`v-show` or a class toggle instead): the `<!--v-if-->` placeholder comment lands in the contenteditable DOM.

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

Svedit is a rich content editor template built with Vue 3 that uses a graph-based data model. It is a 1:1 port of the Svelte original and shares its document format.

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

- `Svedit.vue` - Main editor component with event handling and selection management
- `NodeArrayProperty.vue` - Renders containers that hold sequences of nodes
- `Node.vue` - Wrapper component for document nodes that handles node gap placement and viewport culling
- `TextProperty.vue` - Handles text rendering and editing with inline annotations
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
4. Components render content based on document state and schema definitions
