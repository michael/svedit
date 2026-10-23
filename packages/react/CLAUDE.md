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
- React APIs: `useState`, `useEffect`, `useLayoutEffect`, `useSyncExternalStore`, etc.
- React props and event handlers: `className`, `onMouseDown`, `onChange`, `contentEditable`, etc.
- DOM properties: `innerHTML`, `textContent`, `nodeType`, etc.

- Custom React hooks: `useSvedit`, `useNode`, `useSnapshot`, `useAttach`, etc. React's rules-of-hooks lint and the React Compiler only recognize hooks by the `useX` naming convention, so hooks are the one custom-identifier exception to snake_case.

**Pattern**: If it's a web platform API, a React API or a React hook, keep camelCase. If it's our custom variable/function name, use snake_case.

**Component authoring:**

- Components are function components in `.tsx` files with colocated `.css` files. There are no scoped styles: qualify selectors with a component-specific class (e.g. `.node-paragraph > .text`) instead.
- Components whose DOM is read by the selection mapping (TextProperty, NodeArrayProperty, Node, CustomProperty, NodeGapMarkers) must render their children flat, without wrapper elements, so the DOM-to-model selection mapping can walk the child nodes.
- Element lifecycle hooks use the `useAttach` hook (`src/lib/attach.ts`), the equivalent of Svelte's `{@attach}`; it returns a ref callback whose React 19 cleanup runs on unmount or when the key changes.
- Reactive state lives in plain fields on `Session` and the editor context; every reassignment notifies a `Store` (`src/lib/reactive.ts`). Components read reactive state through `useSvedit(selector)` / `useNode(path)` / `useSnapshot`, never by relying on context identity or parent re-renders. Document and selection values are plain objects.
- `NodeArrayProperty` caches its child elements per key so unchanged siblings bail out of reconciliation; keep its inputs comparison in sync when adding child props.

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

Svedit is a rich content editor template built with React 19 that uses a graph-based data model. It is a 1:1 port of the Svelte original and shares its document format.

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
4. Components render content based on document state and schema definitions, subscribing to the session through `useSvedit`
