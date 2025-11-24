// Main exports for the svedit library
export { default as Svedit } from './Svedit.svelte';
export { default as AnnotatedTextProperty } from './AnnotatedTextProperty.svelte';
export { default as CustomProperty } from './CustomProperty.svelte';
export { default as Node } from './Node.svelte';
export { default as NodeArrayProperty } from './NodeArrayProperty.svelte';

// Core classes and utilities
export { default as Document, define_document_schema } from './Document.svelte.js';
export { default as Transaction } from './Transaction.svelte.js';

// Command system
export { default as Command } from './Command.svelte.js';
export * from './Command.svelte.js';

// Keyboard handling
export { KeyMapper, define_keymap } from './KeyMapper.svelte.js';

// Transforms and utilities
export * from './transforms.svelte.js';
export * from './util.js';
