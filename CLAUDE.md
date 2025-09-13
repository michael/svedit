# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Development:**
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

**Testing:**
- `npm run test:unit` - Run unit tests with Vitest
- `npm run test:e2e` - Run end-to-end tests with Playwright
- `npm run test` - Run both unit and e2e tests

**Testing Guidelines:**
- DO NOT run tests automatically (test:unit, test:e2e, test, etc.)
- The user prefers to run all tests manually
- Focus on implementing code changes and let the user handle testing

**Implementation Guidelines:**
- Do exactly what the user asks for - one step at a time
- Do NOT think 4 steps ahead or add extra features/improvements
- Only implement the specific change requested
- You can suggest what the next step could be, but don't implement it

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
- Svelte event handlers: `onclick`, `onmousedown`, etc.
- DOM properties: `innerHTML`, `textContent`, `nodeType`, etc.

**Pattern**: If it's a web platform API or Svelte API, keep camelCase. If it's our custom variable/function name, use snake_case.

## Architecture

Svedit is a rich content editor template built with Svelte 5 that uses a graph-based data model.

### Core Components

**Document Model:**
- `Document` - Central document class with state management, transactions, and history
- `Tras` - Handles atomic operations on the document
- Documents are represented as graphs of nodes with properties and references

**Selection System:**
- Supports text, node, and property selections
- Maps between internal selection model and DOM selection
- Handles complex selection scenarios like backwards selections and multi-node selections

**Key Components:**
- `Svedit.svelte` - Main editor component with event handling and selection management
- `NodeArrayProperty.svelte` - Renders containers that hold sequences of nodes
- `AnnotatedTextProperty.svelte` - Handles annotated text rendering and editing
- Node components (`Story`, `List`, etc.) - Render specific content types

### Schema System

Content is defined through schemas that specify:
- Node types and their properties
- Property types: `string`, `integer`, `boolean`, `string_array`, `annotated_text`, `node`, `node_array`
- Reference relationships between nodes
- Default types for node arrays

### Data Flow

1. Raw document data is loaded into `Document`
2. Changes are made through transactions for undo/redo support
3. Selection state is synchronized between internal model and DOM
4. Components render content based on document state and schema definitions

The editor is currently on the `document-graph` branch implementing a new graph-based data model to support shared content across multiple documents.
