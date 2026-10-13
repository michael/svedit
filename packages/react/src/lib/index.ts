// Main exports for the svedit library.
//
// The framework-free core (Session, Transaction, Command, document
// utilities, transforms, paste/export helpers and all data types) lives in
// the `@svedit/core` package and is re-exported here, so `import { ... } from
// '@svedit/react'` keeps working for everything.
export * from '@svedit/core';

// React components
export { default as Svedit } from './Svedit.js';
export { default as TextProperty } from './TextProperty.js';
export { default as CustomProperty } from './CustomProperty.js';
export { default as Node } from './Node.js';
export { default as NodeArrayProperty } from './NodeArrayProperty.js';
export { default as NodeGap } from './NodeGap.js';
export { default as NodeGapMarkers } from './NodeGapMarkers.js';
export { default as NodeCaret } from './NodeCaret.js';
export { default as NodeSelectionMarkers } from './NodeSelectionMarkers.js';

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
	AnyComponent
} from './types.js';

// React bindings: contexts, hooks and element attachments
export { SveditContextObject, KeyMapperContext, useSveditContext } from './context.js';
export { useSvedit, useNode } from './hooks.js';
export { useAttach } from './attach.js';
export type { Attachment as ElementAttachment } from './attach.js';
export { useSnapshot, useVersion } from './reactive.js';
