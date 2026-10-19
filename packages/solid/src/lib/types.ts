import type { Component, JSX } from 'solid-js';
import type { DocumentPath, DocumentSchema, NodeArrayAttachmentContext } from '@svedit/core';
import type Session from './Session.js';
import type { VisibilityRegistryApi } from './node_visibility.js';

// Everything framework-independent (schemas, documents, selections, session
// config, ...) comes from the @svedit/core package. This module adds the
// Solid component props and the editor context.
export type * from '@svedit/core';

/** Inline styles: a CSS string or a Solid style object. */
export type StyleProp = JSX.CSSProperties | string;

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
	/** Inline styles appended after the element's anchor-name */
	style?: StyleProp;
	/** A placeholder to be rendered for empty content */
	placeholder?: string;
	/** Rest props to spread onto the rendered element (e.g. href, target, etc.) */
	[key: string]: unknown;
};

/**
 * Props for the CustomProperty component.
 * The content of the custom property (e.g. an image) is passed as children.
 */
export type CustomPropertyProps = {
	/** The full path to the property */
	path: DocumentPath;
	/** Optional custom HTML tag */
	tag?: string;
	/** The `class` attribute on the content element */
	class?: string;
	/** Inline styles appended after the element's anchor-name */
	style?: StyleProp;
	/** The content of the custom property (e.g. an image) */
	children?: JSX.Element;
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
	/** Inline styles appended after the element's anchor-name */
	style?: StyleProp;
	/** Rest props to spread onto the rendered element (e.g. href, target, etc.) */
	[key: string]: unknown;
};

/**
 * Props for the Node component.
 * The type-specific content of the node is passed as children.
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
	/** Inline styles appended after the element's anchor-name */
	style?: StyleProp;
	/** The type-specific content of the node */
	children?: JSX.Element;
	/** Rest props to spread onto the rendered element (e.g. href, target, etc.) */
	[key: string]: unknown;
};

/**
 * Props every node component receives from `<NodeArrayProperty>` (or from
 * `<Svedit>` for the root node). Mark components additionally receive
 * `content` (text marks) or `children` (node-array marks).
 */
export type NodeComponentProps = {
	/** The full path to the node */
	path: DocumentPath;
	/** The single node-array mark wrapping this node, if any */
	mark?: NodeArrayAttachmentContext | null;
	/** All node-array annotations covering this node */
	annotations?: Array<NodeArrayAttachmentContext>;
};

/**
 * Props mark components receive: `content` for text marks, `children`
 * for node-array marks wrapping a run of nodes.
 */
export type MarkComponentProps = {
	/** The path to the mark's `node_id` inside the owning property */
	path: DocumentPath;
	/** The marked text (text marks only) */
	content?: string;
	/** The wrapped child nodes (node-array marks only) */
	children?: JSX.Element;
};

/** Imperative handle passed to `<Svedit>`'s `ref` callback. */
export type SveditHandle = {
	focus_canvas: () => void;
};

/**
 * Props for the Svedit component
 */
export type SveditProps<S extends DocumentSchema = DocumentSchema> = {
	/** The schema-typed session instance */
	session: Session<S>;
	/**
	 * Determines whether the document should be editable or read-only.
	 * Controlled whenever it is provided: pass `on_editable_change` too, so a
	 * command that sets `context.editable` (e.g. save) reaches the owner of
	 * the flag. Omit it to let the editor manage the flag itself (defaults to
	 * false).
	 */
	editable?: boolean;
	/** Called when a command (e.g. save) changes the editable flag. */
	on_editable_change?: (editable: boolean) => void;
	/** The path to the root element (e.g. ['page_1']) */
	path: DocumentPath;
	/** The `class` attribute on the canvas element */
	class?: string;
	/** The `autocapitalize` attribute on the canvas element */
	autocapitalize?: 'on' | 'off';
	/** The `spellcheck` attribute on the canvas element */
	spellcheck?: 'true' | 'false';
	/** Receives the imperative handle exposing `focus_canvas()` */
	ref?: (handle: SveditHandle) => void;
};

/**
 * Context provided by the Svedit component to commands and descendant components.
 *
 * The object is stable for the editor's lifetime; its fields are reactive
 * getters backed by signals, so reading them inside a memo, effect or JSX
 * expression subscribes to them.
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

/** A Solid component registered in `config.node_components` or `config.system_components`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyComponent = Component<any>;
