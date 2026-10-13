// Main exports for the svedit library.
//
// The framework-free core (Session logic, Transaction, Command, document
// utilities, transforms, paste/export helpers and all data types) lives in
// the `@svedit/core` package and is re-exported here, so `import { ... } from
// '@svedit/vue'` keeps working for everything.
export * from '@svedit/core';

// Vue components
export { default as Svedit } from './Svedit.vue';
export { default as TextProperty } from './TextProperty.vue';
export { default as CustomProperty } from './CustomProperty.vue';
export { default as Node } from './Node.vue';
export { default as NodeArrayProperty } from './NodeArrayProperty.vue';
export { default as NodeGap } from './NodeGap.vue';
export { default as NodeGapMarkers } from './NodeGapMarkers.vue';
export { default as NodeCaret } from './NodeCaret.vue';
export { default as NodeSelectionMarkers } from './NodeSelectionMarkers.vue';

// The Session with Vue reactivity (shadows the core export above)
export { default as Session } from './Session.js';

// Component props and render contexts
export type {
	SveditProps,
	SveditContext,
	TextPropertyProps,
	CustomPropertyProps,
	NodeArrayPropertyProps,
	NodeProps
} from './types.js';

// Element attachments (Vue directive used by Node and NodeArrayProperty)
export { vAttach } from './attach.js';
export type { Attachment as ElementAttachment, AttachBinding } from './attach.js';
