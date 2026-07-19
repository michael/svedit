import type Session from './Session.svelte.js';
import type { VisibilityRegistryApi } from './node_visibility.svelte.js';

// ===== SVELTE TYPE IMPORTS =====

/**
 * Import Svelte's Snippet type for properly typing children in components
 */
import type { Snippet } from 'svelte';

// ===== SELECTION TYPE DEFINITIONS =====

/**
 * A unique node identifier.
 *
 * Node ids must be valid Svedit path string segments: they must start with
 * a letter or underscore, contain only letters, numbers, underscores, or
 * dashes, and must not contain `__`.
 */
export type NodeId = string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DynamicRecord = Record<string, any>;
export type SessionConfig = DynamicRecord;
export type CommandRegistry = DynamicRecord;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocumentOperation = [string, ...any[]];

/**
 * Array of IDs, property names (strings), or indexes (integers) that identify a node or property in the document.
 * String segments must follow the same path segment rules as NodeId.
 */
export type DocumentPath = Array<string | number>;

/**
 * Text selection within a text property
 */
export type TextSelection = {
	type: 'text';
	path: DocumentPath;
	anchor_offset: number;
	focus_offset: number;
};

/**
 * Node selection within a node array
 */
export type NodeSelection = {
	type: 'node';
	path: DocumentPath;
	anchor_offset: number;
	focus_offset: number;
};

/**
 * Property selection within a node
 */
export type PropertySelection = {
	type: 'property';
	path: DocumentPath;
};

/**
 * Union type for all possible selection types
 */
export type Selection = TextSelection | NodeSelection | PropertySelection;

/**
 * Represents only the range (no direction and payload) of a NodeSelection or TextSelection
 */
export type SelectionRange = {
	start_offset: number;
	end_offset: number;
};

// ===== SCHEMA TYPE DEFINITIONS =====

/**
 * Basic scalar types supported by the schema system.
 */
export type ScalarType = 'string' | 'number' | 'boolean' | 'integer' | 'datetime';

/**
 * Array types for collections of scalar values.
 */
export type ArrayType = 'string_array' | 'number_array' | 'boolean_array' | 'integer_array';

/**
 * Special types for rich content.
 */
export type RichType = 'text';

/**
 * Node reference types for linking to other nodes.
 */
export type ReferenceType = 'node' | 'node_array';

/**
 * All primitive types that can be used in property definitions.
 */
export type PrimitiveType = ScalarType | ArrayType | RichType;

/**
 * All possible property types in schemas.
 */
export type PropertyType = PrimitiveType | ReferenceType;

// ===== SCHEMA-DERIVED NODE TYPES =====

/**
 * Maps a schema property definition to the runtime value type it stores.
 */
export type PropertyValue<P extends PropertyDefinition> = P extends {
	type: 'string';
	values: readonly (infer Value extends string)[];
}
	? Value
	: P extends { type: 'string' }
		? string
		: P extends { type: 'number' }
			? number
			: P extends { type: 'integer' }
				? number
				: P extends { type: 'boolean' }
					? boolean
					: P extends { type: 'datetime' }
						? string
						: P extends { type: 'string_array' }
							? string[]
							: P extends { type: 'number_array' }
								? number[]
								: P extends { type: 'integer_array' }
									? number[]
									: P extends { type: 'boolean_array' }
										? boolean[]
										: P extends { type: 'text' }
											? Text
											: P extends { type: 'node' }
												? NodeId
												: P extends { type: 'node_array' }
													? NodeArray
													: never;

/**
 * The runtime shape of a node of a specific type, derived from the schema.
 *
 * Falls back to the untyped DocumentNode when the schema is not a concrete
 * schema literal (e.g. the DocumentSchema default of Session).
 */
export type NodeOfType<S extends DocumentSchema, T extends keyof S> = string extends keyof S
	? DocumentNode
	: {
			id: NodeId;
			type: T;
		} & {
			[K in keyof S[T]['properties']]: PropertyValue<S[T]['properties'][K]>;
		};

/**
 * Discriminated union of all node types in a schema. Narrow with
 * `node.type === '...'` to get exact property types.
 *
 * Falls back to the untyped DocumentNode when the schema is not a concrete
 * schema literal (e.g. the DocumentSchema default of Session).
 */
export type AnyNode<S extends DocumentSchema> = string extends keyof S
	? DocumentNode
	: {
			[T in keyof S]: NodeOfType<S, T>;
		}[keyof S];

/**
 * Convenience map from node type name to its runtime node shape,
 * e.g. `NodeMap<typeof document_schema>['story']`.
 */
export type NodeMap<S extends DocumentSchema> = {
	[T in keyof S]: NodeOfType<S, T>;
};

/**
 * Assert that a node is of the given type. Narrows the static type and
 * checks at runtime — for call sites that know what they expect.
 */
/**
 * A property that stores text with optional marks and annotations and required allow_newlines setting.
 */
export type TextProperty = {
	type: 'text';
	mark_types?: string[];
	annotation_types?: string[];
	allow_newlines: boolean;
};

/**
 * A property that stores a string value.
 */
export type StringProperty = {
	type: 'string';
	default?: string;
	values?: readonly string[];
};

/**
 * A property that stores a number value.
 */
export type NumberProperty = {
	type: 'number';
	default?: number;
};

/**
 * A property that stores a boolean value.
 */
export type BooleanProperty = {
	type: 'boolean';
	default?: boolean;
};

/**
 * A property that stores an integer value.
 */
export type IntegerProperty = {
	type: 'integer';
	default?: number;
	min?: number;
	max?: number;
};

/**
 * A property that stores a datetime value.
 */
export type DatetimeProperty = {
	type: 'datetime';
	default?: string;
};

/**
 * A property that stores an array of strings.
 */
export type StringArrayProperty = {
	type: 'string_array';
	default?: string[];
};

/**
 * A property that stores an array of numbers.
 */
export type NumberArrayProperty = {
	type: 'number_array';
	default?: number[];
};

/**
 * A property that stores an array of booleans.
 */
export type BooleanArrayProperty = {
	type: 'boolean_array';
	default?: boolean[];
};

/**
 * A property that stores an array of integers.
 */
export type IntegerArrayProperty = {
	type: 'integer_array';
	default?: number[];
};

/**
 * A property that stores a primitive value (excluding text).
 */
export type PrimitiveProperty =
	| StringProperty
	| NumberProperty
	| BooleanProperty
	| IntegerProperty
	| DatetimeProperty
	| StringArrayProperty
	| NumberArrayProperty
	| BooleanArrayProperty
	| IntegerArrayProperty;

/**
 * A property that stores a reference to a single node.
 */
export type NodeProperty = {
	type: 'node';
	node_types: string[];
	default_node_type?: string;
};

/**
 * A property that stores an array of node references.
 */
export type NodeArrayProperty = {
	type: 'node_array';
	node_types: string[];
	mark_types?: string[];
	annotation_types?: string[];
	default_node_type?: string;
};

/**
 * Union type for all possible property definitions.
 */
export type PropertyDefinition =
	| PrimitiveProperty
	| TextProperty
	| NodeProperty
	| NodeArrayProperty;

/**
 * Node kind values for different types of content nodes
 */
export type NodeKind = 'document' | 'block' | 'text' | 'mark' | 'annotation';

/**
 * Schema for text nodes - must have a content property of type text.
 * Use define_document_schema to also check that content is the only text property.
 */
export type TextNodeSchema = {
	kind: 'text';
	properties: {
		content: TextProperty;
	} & Record<string, PropertyDefinition>;
};

export type TextPropertyNames<Properties> = {
	[PropertyName in keyof Properties]: Properties[PropertyName] extends { type: 'text' }
		? PropertyName
		: never;
}[keyof Properties];

export type TextNodeSchemaError<Message extends string> = {
	[SchemaError in `Svedit schema error: ${Message}`]: never;
};

export type TextNodeMissingContentError =
	TextNodeSchemaError<'Text node schemas must define a "content" property of type text.'>;

export type TextNodeExtraTextPropertyError<ExtraProperty extends string> =
	TextNodeSchemaError<`Text node schemas must not define text property "${ExtraProperty}". Use "content" as the only text property.`>;

export type ValidateTextNodeSchema<Schema> = Schema extends {
	kind: 'text';
	properties: infer Properties;
}
	? string extends keyof Properties
		? Schema
		: Properties extends { content: TextProperty }
			? Exclude<TextPropertyNames<Properties>, 'content'> extends infer ExtraProperties
				? [ExtraProperties] extends [never]
					? Schema
					: TextNodeExtraTextPropertyError<Extract<ExtraProperties, string>>
				: never
			: TextNodeMissingContentError
	: Schema;

export type ValidateDocumentSchema<Schema extends Record<string, NodeSchema>> = {
	[NodeType in keyof Schema]: ValidateTextNodeSchema<Schema[NodeType]>;
};

/**
 * Schema for non-text nodes
 */
export type NonTextNodeSchema = {
	kind: 'document' | 'block' | 'mark' | 'annotation';
	properties: Record<string, PropertyDefinition>;
};

/**
 * A node schema defines the structure of a specific node type.
 * Contains a kind and properties object that maps property names to their definitions.
 */
export type NodeSchema = TextNodeSchema | NonTextNodeSchema;

/**
 * A document schema defines all node types available in a document.
 * Maps node type names to their schemas.
 */
export type DocumentSchema = Record<string, NodeSchema>;

/**
 * A node in the document.
 * Must have id and type properties, with other properties defined by the schema.
 */
export type DocumentNode = {
	id: string;
	type: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
};

export type Inspection = {
	kind: 'property' | 'node';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
};

/**
 * The document format - an object with document_id and nodes.
 * The nodes object maps node IDs to their node data.
 */
export type Document = {
	document_id: string;
	nodes: {
		[key: string]: DocumentNode;
	};
};

/** Converts a document node to HTML, with access to recursive exporters. */
export type NodeHtmlExporter<S extends DocumentSchema = DocumentSchema> = (
	node: DocumentNode,
	session: Session<S>,
	html_exporters: Record<string, NodeHtmlExporter<S>>
) => string;

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
 * Props for the CustomProperty component
 */
export type CustomPropertyProps = {
	/** The full path to the property */
	path: DocumentPath;
	/** Optional custom HTML tag */
	tag?: string;
	/** The `class` attribute on the content element */
	class?: string;
	/** The content of the custom property (e.g. an image) */
	children: Snippet;
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
 * Props for the Node component
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
	/** The type-specific content of the node */
	children: Snippet;
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
	/**
	 * Experimental: render zero-size markers carrying the CSS anchor names
	 * --text-selection-start and --text-selection-end at the bounds of the
	 * current text selection, so overlays can position themselves against
	 * the selection declaratively (#299). Markers only exist while the
	 * canvas is not focused.
	 */
	text_selection_anchors?: boolean;
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
	text_selection_anchors: boolean;
	focus_canvas: () => void;
	visibility_registry?: VisibilityRegistryApi;
};

/** Internal descendant context after Svedit's visibility registry is installed. */
export type SveditRenderContext<S extends DocumentSchema = DocumentSchema> = SveditContext<S> & {
	visibility_registry: VisibilityRegistryApi;
};

/**
 * A range with an attached payload node, used for both marks and annotations.
 */
export type Attachment = {
	start_offset: number;
	end_offset: number;
	node_id: NodeId;
};

/**
 * A content-level range (e.g. strong, emphasis, link, section).
 * Marks are mutually exclusive within a property and render in-place.
 */
export type Mark = Attachment;

/**
 * A metadata/overlay range (e.g. comment, marker).
 * Annotations may overlap and are data-only.
 */
export type Annotation = Attachment;

/**
 * Represents text content with marks and annotations.
 */
export type Text = {
	content: string;
	marks: Array<Mark>;
	annotations: Array<Annotation>;
};

/**
 * Represents a node array with nodes, marks and annotations.
 */
export type NodeArray = {
	nodes: Array<NodeId>;
	marks: Array<Mark>;
	annotations: Array<Annotation>;
};

/**
 * Attachment context passed to a node rendered inside a node array.
 * It is the flattened mark or annotation attachment, enriched with the resolved
 * payload node, its index in the parent attachment array, and this child node's
 * position in the attachment range.
 */
export type NodeArrayAttachmentContext = {
	start_offset: number;
	end_offset: number;
	node_id: NodeId;
	index: number;
	node: DocumentNode;
	is_start: boolean;
	is_middle: boolean;
	is_end: boolean;
};

/** Internal context shared by a node array and its rendered child nodes. */
export type NodeArrayRenderContext = {
	length: number;
	mark_for: (node_index: number) => NodeArrayAttachmentContext | null;
	annotations_for: (node_index: number) => NodeArrayAttachmentContext[];
};

/**
 * Represents a selection highlight fragment for unmarked text selections
 */
export type SelectionHighlightFragment = {
	type: 'selection_highlight';
	content: string;
};

/**
 * Represents a zero-size selection boundary anchor marker (#299)
 */
export type SelectionAnchorFragment = {
	type: 'selection_anchor';
	kind: 'start' | 'end';
};

/**
 * Represents a mark fragment in text content
 */
export type MarkFragment = {
	type: 'mark';
	/** NodeId that has mark type and details */
	node: DocumentNode;
	/** The text content of the mark */
	content: string;
	/** Index of the mark in the original array */
	mark_index: number;
};

/**
 * Represents a fragment of text content
 */
export type Fragment = string | MarkFragment | SelectionHighlightFragment | SelectionAnchorFragment;

/**
 * Represents a node array fragment for plain nodes
 */
export type NodeArrayPlainFragment = {
	type: 'nodes';
	nodes: Array<NodeId>;
	start_index: number;
};

/**
 * Represents a mark fragment in node array content
 */
export type NodeArrayMarkFragment = {
	type: 'mark';
	/** NodeId that has mark type and details */
	node: DocumentNode;
	/** The nodes wrapped by the mark */
	nodes: Array<NodeId>;
	/** Start index in the original nodes array */
	start_index: number;
	/** Index of the mark in the original array */
	mark_index: number;
};

/**
 * Represents a fragment of node array content
 */
export type NodeArrayFragment = NodeArrayPlainFragment | NodeArrayMarkFragment;
