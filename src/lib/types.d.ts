import type Session from './Session.svelte.js';
import type Svedit from './Svedit.svelte';

// ===== SVELTE TYPE IMPORTS =====

/**
 * Import Svelte's Snippet type for properly typing children in components
 */
import type { Component, Snippet } from 'svelte';

// ===== SELECTION TYPE DEFINITIONS =====

/**
 * A unique node identifier.
 *
 * Node ids must be valid Svedit path string segments: they must start with
 * a letter or underscore, contain only letters, numbers, underscores, or
 * dashes, and must not contain `__`.
 */
export type NodeId = string;

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

// TODO: We may later want more sophisticated type inference, so that typing
// e.g. `session.get('image')` auto-completes the node's properties based on
// the schema definition. The types below are a starting point for that.
//
// export type DocumentSchemaPrimitive =
// 	| 'string'
// 	| 'number'
// 	| 'boolean'
// 	| 'integer'
// 	| 'datetime'
// 	| 'string_array'
// 	| 'number_array'
// 	| 'boolean_array'
// 	| 'integer_array'
// 	| 'text'
// 	| 'node'
// 	| 'node_array';
//
// export type DocumentSchemaValueToJs<T> = T extends 'string'
// 	? string
// 	: T extends 'number'
// 		? number
// 		: T extends 'boolean'
// 			? boolean
// 			: T extends 'integer'
// 				? number
// 				: T extends 'datetime'
// 					? string
// 					: T extends 'string_array'
// 						? Array<string>
// 						: T extends 'number_array'
// 							? Array<number>
// 							: T extends 'boolean_array'
// 								? Array<boolean>
// 								: T extends 'integer_array'
// 									? Array<number>
// 									: T extends 'text'
// 										? AnnotatedText
// 										: T extends 'node'
// 											? string
// 											: T extends 'node_array'
// 												? Array<string>
// 												: never;
//
// export type DocumentNodeToJs<S extends NodeSchema> = { id: string; type: string } & {
// 	[K in keyof S['properties']]: DocumentSchemaValueToJs<S['properties'][K]['type']>;
// };

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
	PrimitiveProperty | TextProperty | NodeProperty | NodeArrayProperty;

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
 * A package groups everything one concern needs (schema entries including
 * sub-node types, components, inserters, exporters, commands, keymap
 * contributions). Packages are merged into a flat schema + config via
 * `compose`.
 */
export type Package = {
	/** Unique package name used in compose diagnostics */
	name: string;
	/** Schema entries contributed by this package (loosely typed so plain
	 * object literals don't require const assertions; the merged result is
	 * validated at Session construction) */
	schema?: Record<string, any>;
	/** Components per node type, merged into config.node_components */
	node_components?: Record<string, any>;
	/** System components, merged into config.system_components */
	system_components?: Record<string, any>;
	/** Custom inserters per node type, merged into config.inserters */
	inserters?: Record<string, (tr: any, content?: any) => void>;
	/** HTML exporters per node type, merged into config.html_exporters */
	html_exporters?: Record<string, (node: any, session: any, html_exporters: any) => string>;
	/** Command factory; returned commands are merged by name */
	commands?: (context: any) => Record<string, any>;
	/** Key combos mapped to arrays of command names */
	keymap?: Record<string, string[]>;
	/** Custom app-owned registries, merged into config by key */
	[key: string]: any;
};

/**
 * A node in the document.
 * Must have id and type properties, with other properties defined by the schema.
 */
export type DocumentNode = {
	id: string;
	type: string;
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
	[key: string]: any;
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
	[key: string]: any;
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
	[key: string]: any;
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
	[key: string]: any;
};

/**
 * Props for the Svedit component
 */
export type SveditProps = {
	/** The session instance */
	session: Session;
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
export type AnnotatedText = {
	content: string;
	marks: Array<Mark>;
	annotations: Array<Annotation>;
};

/**
 * Represents an annotated node array with nodes, marks and annotations
 */
export type AnnotatedNodeArray = {
	nodes: Array<NodeId>;
	marks: Array<Mark>;
	annotations: Array<Annotation>;
};

/**
 * Attachment context passed to a node rendered inside an annotated node array.
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

/**
 * Represents a selection highlight fragment for non-annotated text selections
 */
export type SelectionHighlightFragment = {
	type: 'selection_highlight';
	content: string;
};

/**
 * Represents a mark fragment in annotated text content
 */
export type MarkFragment = {
	type: 'mark';
	/** NodeId that has mark type and details */
	node: any;
	/** The text content of the mark */
	content: string;
	/** Index of the mark in the original array */
	mark_index: number;
};

/**
 * Represents a fragment of annotated text content
 */
export type Fragment = string | MarkFragment | SelectionHighlightFragment;

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
	node: any;
	/** The nodes wrapped by the mark */
	nodes: Array<NodeId>;
	/** Start index in the original nodes array */
	start_index: number;
	/** Index of the mark in the original array */
	mark_index: number;
};

/**
 * Represents a fragment of annotated node array content
 */
export type NodeArrayFragment = NodeArrayPlainFragment | NodeArrayMarkFragment;
