// @svedit/core — the framework-free core shared by the Svelte, React, Vue and Solid
// versions of Svedit.
//
// Framework bindings re-export everything here and add their components,
// their Session subclass (which installs the framework's reactivity
// tracker) and framework-specific helpers.

// Core classes
export { default as Session } from './Session.js';
export { default as Transaction } from './Transaction.js';
export { default as Command } from './Command.js';
export * from './Command.js';

// Reactivity primitives used by the bindings
export { Store, derived, shallow_equal } from './reactive.js';
export type { DerivedSource, Listener, Subscribable, Tracker } from './reactive.js';

// Public types
export type * from './types.js';

// Document utilities
export * from './doc_utils.js';

// Keyboard handling
export { KeyMapper, define_keymap } from './KeyMapper.js';
export type { Keymap } from './KeyMapper.js';

// Transforms and utilities
export * from './transforms.js';
export * from './utils.js';

// Paste and HTML
export * from './paste_utils.js';
export * from './html_paste.js';
export * from './html_export.js';
export * from './html_utils.js';

// DOM-level editor helpers shared by the Svelte, React, Vue and Solid editor
// components: clipboard format and exporters, DOM to model selection
// mapping, canvas DOM helpers, paste strategies and insert carets.
export * from './clipboard.js';
export * from './dom_selection.js';
export * from './canvas_dom.js';
export * from './editor_paste.js';
