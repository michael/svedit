import type Session from './Session.js';
import type { VisibilityRegistryApi } from './node_visibility.js';
import type { DocumentPath, DocumentSchema, NodeArrayAttachmentContext } from '@svedit/core';

// Everything framework-independent (schemas, documents, selections, session
// config, ...) comes from the @svedit/core package. This module adds the Vue
// component props and the editor context.
export type * from '@svedit/core';

/**
 * Props for the TextProperty component
 */
export type TextPropertyProps = {
	/** The full path to the property */
	path: DocumentPath;
	/** Optional custom HTML tag */
	tag?: string;
	/** The `class` attribute on the content element */
	class?: string;
	/** A placeholder to be rendered for empty content */
	placeholder?: string;
	/** Rest props to spread onto the rendered element (e.g. href, target, etc.) */
	[key: string]: unknown;
};

/**
 * Props for the CustomProperty component.
 * The content of the custom property (e.g. an image) is passed via the default slot.
 */
export type CustomPropertyProps = {
	/** The full path to the property */
	path: DocumentPath;
	/** Optional custom HTML tag */
	tag?: string;
	/** The `class` attribute on the content element */
	class?: string;
	/** Rest props to spread onto the rendered element */
	[key: string]: unknown;
};

/**
 * Props for the NodeArray component
 */
export type NodeArrayPropertyProps = {
	/** The full path to the property */
	path: DocumentPath;
	/** Optional custom HTML tag */
	tag?: string;
	/** The `class` attribute on the container element */
	class?: string;
	/** Rest props to spread onto the rendered element (e.g. href, target, etc.) */
	[key: string]: unknown;
};

/**
 * Props for the Node component.
 * The type-specific content of the node is passed via the default slot.
 */
export type NodeProps = {
	/** The full path to the node */
	path: DocumentPath;
	/** The single node-array mark wrapping this node, if any */
	mark?: NodeArrayAttachmentContext | null;
	/** All node-array annotations covering this node */
	annotations?: Array<NodeArrayAttachmentContext>;
	/** Optional custom HTML tag */
	tag?: string;
	/** Optional string of CSS classes */
	class?: string;
	/** Rest props to spread onto the rendered element (e.g. href, target, etc.) */
	[key: string]: unknown;
};

/**
 * Props for the Svedit component
 */
export type SveditProps<S extends DocumentSchema = DocumentSchema> = {
	/** The schema-typed session instance */
	session: Session<S>;
	/** Determines wether the document should be editable or read-only. */
	editable?: boolean;
	/** The path to the root element (e.g. ['page_1']) */
	path: DocumentPath;
	/** The `class` attribute on the canvas element */
	class?: string;
	/** The `autocapitalize` attribute on the canvas element */
	autocapitalize?: 'on' | 'off';
	/** The `spellcheck` attribute on the canvas element */
	spellcheck?: 'true' | 'false';
};

/**
 * Context provided by the Svedit component to commands and descendant components.
 */
export type SveditContext<S extends DocumentSchema = DocumentSchema> = {
	session: Session<S>;
	editable: boolean;
	is_composing: boolean;
	canvas_el: HTMLElement | undefined;
	canvas_focused: boolean;
	focus_canvas: () => void;
	visibility_registry?: VisibilityRegistryApi;
};

/** Internal descendant context after Svedit's visibility registry is installed. */
export type SveditRenderContext<S extends DocumentSchema = DocumentSchema> = SveditContext<S> & {
	visibility_registry: VisibilityRegistryApi;
};
