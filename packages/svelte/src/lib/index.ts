// Main exports for the svedit library.
//
// The framework-free core (Session logic, Transaction, Command, document
// utilities, transforms, paste/export helpers and all data types) lives in
// the `@svedit/core` package and is re-exported here, so `import { ... } from
// 'svedit'` keeps working for everything.
export * from '@svedit/core';

// Svelte components
export { default as Svedit } from './Svedit.svelte';
export { default as TextProperty } from './TextProperty.svelte';
export { default as CustomProperty } from './CustomProperty.svelte';
export { default as Node } from './Node.svelte';
export { default as NodeArrayProperty } from './NodeArrayProperty.svelte';
export { default as NodeGap } from './NodeGap.svelte';
export { default as NodeGapMarkers } from './NodeGapMarkers.svelte';
export { default as NodeCaret } from './NodeCaret.svelte';
export { default as NodeSelectionMarkers } from './NodeSelectionMarkers.svelte';

// The Session with Svelte reactivity (shadows the core export above)
export { default as Session } from './Session.svelte.js';

// Component props and render contexts
export type {
	SveditProps,
	SveditContext,
	TextPropertyProps,
	CustomPropertyProps,
	NodeArrayPropertyProps,
	NodeProps
} from './types.js';
