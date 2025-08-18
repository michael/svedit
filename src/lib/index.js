// Main exports for the svedit library
export { default as Svedit } from './Svedit.svelte';
export { default as AnnotatedStringProperty } from './AnnotatedStringProperty.svelte';
export { default as CustomProperty } from './CustomProperty.svelte';
export { default as Node } from './Node.svelte';
export { default as NodeArrayProperty } from './NodeArrayProperty.svelte';

// Core classes and utilities
export { default as Document, define_document_schema } from './Document.svelte.js';
export { default as Transaction } from './Transaction.svelte.js';

// Commands and utilities
export * from './commands.svelte.js';
export * from './util.js';
