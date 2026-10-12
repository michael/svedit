import type { CSSProperties, ComponentType, JSX, ReactNode, Ref } from 'react';
import type {
	DocumentPath,
	DocumentSchema,
	Listener,
	NodeArrayAttachmentContext,
	Session
} from '@svedit/core';
import type { VisibilityRegistryApi } from './node_visibility.js';

// Everything framework-independent (schemas, documents, selections, session
// config, ...) comes from the @svedit/core package. This module adds the React
// component props and the editor context.
export type * from '@svedit/core';

/**
 * Props for the TextProperty component
 */
export type TextPropertyProps = {
	/** The full path to the property */
	path: DocumentPath;
	/** Optional custom HTML tag */
	tag?: keyof JSX.IntrinsicElements;
	/** The `class` attribute on the content element */
	className?: string;
	/** Inline styles merged after the element's anchor-name */
	style?: CSSProperties;
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
	tag?: keyof JSX.IntrinsicElements;
	/** The `class` attribute on the content element */
	className?: string;
	/** Inline styles merged after the element's anchor-name */
	style?: CSSProperties;
	/** The content of the custom property (e.g. an image) */
	children?: ReactNode;
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
	tag?: keyof JSX.IntrinsicElements;
	/** The `class` attribute on the container element */
	className?: string;
	/** Inline styles merged after the element's anchor-name */
	style?: CSSProperties;
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
	tag?: keyof JSX.IntrinsicElements;
	/** Optional string of CSS classes */
	className?: string;
	/** Inline styles merged after the element's anchor-name */
	style?: CSSProperties;
	/** The type-specific content of the node */
	children?: ReactNode;
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
	children?: ReactNode;
};

/** Imperative handle exposed by `<Svedit>` through its `ref`. */
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
	 * Controlled when provided together with `on_editable_change`; omit it
	 * to let the editor manage the flag itself (defaults to false).
	 */
	editable?: boolean;
	/** Called when a command (e.g. save) changes the editable flag. */
	on_editable_change?: (editable: boolean) => void;
	/** The path to the root element (e.g. ['page_1']) */
	path: DocumentPath;
	/** The `class` attribute on the canvas element */
	className?: string;
	/** The `autocapitalize` attribute on the canvas element */
	autocapitalize?: 'on' | 'off';
	/** The `spellcheck` attribute on the canvas element */
	spellcheck?: 'true' | 'false';
	/** Imperative handle exposing `focus_canvas()` */
	ref?: Ref<SveditHandle>;
};

/**
 * Context provided by the Svedit component to commands and descendant components.
 *
 * The object is stable for the editor's lifetime; its fields are live
 * getters. Components subscribe to changes of `editable`, `is_composing`,
 * `canvas_el` and `canvas_focused` through `subscribe` (see `useSvedit`).
 */
export type SveditContext<S extends DocumentSchema = DocumentSchema> = {
	session: Session<S>;
	editable: boolean;
	is_composing: boolean;
	canvas_el: HTMLElement | undefined;
	canvas_focused: boolean;
	focus_canvas: () => void;
	/** Subscribes to changes of the context's own state (not the session). */
	subscribe: (listener: Listener) => () => void;
	/** Change counter of the context's own state. */
	version: number;
	visibility_registry?: VisibilityRegistryApi;
};

/** Internal descendant context after Svedit's visibility registry is installed. */
export type SveditRenderContext<S extends DocumentSchema = DocumentSchema> = SveditContext<S> & {
	visibility_registry: VisibilityRegistryApi;
};

/** A React component registered in `config.node_components` or `config.system_components`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyComponent = ComponentType<any>;
