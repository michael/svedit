// Main exports for the svedit library.
//
// The framework-free core (Session logic, Transaction, Command, document
// utilities, transforms, paste/export helpers and all data types) lives in
// the `@svedit/core` package and is re-exported here, so `import { ... } from
// '@svedit/solid'` keeps working for everything.
export * from '@svedit/core';

// Solid components
export { default as Svedit } from './Svedit.js';
export { default as TextProperty } from './TextProperty.js';
export { default as CustomProperty } from './CustomProperty.js';
export { default as Node } from './Node.js';
export { default as NodeArrayProperty } from './NodeArrayProperty.js';
export { default as NodeGap } from './NodeGap.js';
export { default as NodeGapMarkers } from './NodeGapMarkers.js';
export { default as NodeCaret } from './NodeCaret.js';
export { default as NodeSelectionMarkers } from './NodeSelectionMarkers.js';

// The Session with Solid reactivity (shadows the core export above)
export { default as Session } from './Session.js';

// Component props and render contexts
export type {
	SveditProps,
	SveditHandle,
	SveditContext,
	TextPropertyProps,
	CustomPropertyProps,
	NodeArrayPropertyProps,
	NodeProps,
	NodeComponentProps,
	MarkComponentProps,
	AnyComponent,
	StyleProp
} from './types.js';

// Solid bindings: contexts, element attachments and reactive collections
export { SveditContextObject, KeyMapperContext, use_svedit } from './context.js';
export { attach } from './attach.js';
export type { Attachment as ElementAttachment } from './attach.js';
export { ReactiveSet, ReactiveMap } from './reactivity.js';
