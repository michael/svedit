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

## Architecture

Svedit is a rich content editor template built with Svelte 5 that uses a graph-based data model.

### Core Components

**Document Model:**
- `SveditDoc` - Central document class with state management, transactions, and history
- `SveditTransaction` - Handles atomic operations on the document
- Documents are represented as graphs of nodes with properties and references

**Selection System:**
- Supports text, node, and property selections
- Maps between internal selection model and DOM selection
- Handles complex selection scenarios like backwards selections and multi-block selections

**Key Components:**
- `Svedit.svelte` - Main editor component with event handling and selection management
- `NodeArrayProperty.svelte` - Renders containers that hold sequences of nodes
- `AnnotatedStringProperty.svelte` - Handles annotated text rendering and editing
- Block components (`StoryBlock`, `ListBlock`, etc.) - Render specific content types

### Schema System

Content is defined through schemas that specify:
- Node types and their properties
- Property types: `string`, `integer`, `boolean`, `string_array`, `annotated_text`, `node`, `node_array`
- Reference relationships between nodes
- Default types for node arrays

### Data Flow

1. Raw document data is loaded into `SveditDoc`
2. Changes are made through transactions for undo/redo support
3. Selection state is synchronized between internal model and DOM
4. Components render content based on document state and schema definitions

The editor is currently on the `document-graph` branch implementing a new graph-based data model to support shared content across multiple documents.
