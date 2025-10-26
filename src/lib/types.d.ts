import type Document from './Document.svelte.js';
import type Svedit from './Svedit.svelte';

// ===== SVELTE TYPE IMPORTS =====

/**
 * Import Svelte's Snippet type for properly typing children in components
 */
import type { Component, Snippet } from 'svelte';

// ===== SELECTION TYPE DEFINITIONS =====

/**
 * A unique node identifier (ideally UUID)
 */
export type NodeId = string;

/**
 * Array of IDs, property names (strings), or indexes (integers) that identify a node or property in the document
 */
export type DocumentPath = Array<string | number>;

/**
 * Text selection within a text property
 */
export type TextSelection = {
  type: "text";
  path: DocumentPath;
  anchor_offset: number;
  focus_offset: number;
};

/**
 * Node selection within a node array
 */
export type NodeSelection = {
  type: "node";
  path: DocumentPath;
  anchor_offset: number;
  focus_offset: number;
};

/**
 * Property selection within a node
 */
export type PropertySelection = {
  type: "property";
  path: DocumentPath;
};

/**
 * Union type for all possible selection types
 */
export type Selection = TextSelection | NodeSelection | PropertySelection;

// ===== SCHEMA TYPE DEFINITIONS =====

/**
 * Basic scalar types supported by the schema system.
 */
export type ScalarType = "string" | "number" | "boolean" | "integer" | "datetime";

/**
 * Array types for collections of scalar values.
 */
export type ArrayType = "string_array" | "number_array" | "boolean_array" | "integer_array";

/**
 * Special types for rich content.
 */
export type RichType = "annotated_text";

/**
 * Node reference types for linking to other nodes.
 */
export type ReferenceType = "node" | "node_array";

/**
 * All primitive types that can be used in property definitions.
 */
export type PrimitiveType = ScalarType | ArrayType | RichType;

/**
 * All possible property types in schemas.
 */
export type PropertyType = PrimitiveType | ReferenceType;

/**
 * Document schema primitive types - all possible property types in document schemas.
 */
export type DocumentSchemaPrimitive = "string" | "number" | "boolean" | "integer" | "datetime" | "string_array" | "number_array" | "boolean_array" | "integer_array" | "annotated_text" | "node" | "node_array";

/**
 * Maps document schema types to their JavaScript runtime types.
 */
export type DocumentSchemaValueToJs<T> =
  T extends "string" ? string :
  T extends "number" ? number :
  T extends "boolean" ? boolean :
  T extends "integer" ? number :
  T extends "datetime" ? string :
  T extends "string_array" ? Array<string> :
  T extends "number_array" ? Array<number> :
  T extends "boolean_array" ? Array<boolean> :
  T extends "integer_array" ? Array<number> :
  T extends "annotated_text" ? AnnotatedText :
  T extends "node" ? string :
  T extends "node_array" ? Array<string> :
  never;

/**
 * Converts a document node schema definition to its inferred JS type.
 * Handles the {type: "..."} wrapper structure used in document schemas.
 */
export type DocumentNodeToJs<S extends NodeSchema> =
  { id: string, type: string } & { [K in keyof S["properties"]]: DocumentSchemaValueToJs<S["properties"][K]["type"]> };

/**
 * A property that stores an annotated text with required allow_newlines setting.
 */
export type AnnotatedTextProperty = {
  type: 'annotated_text';
  node_types?: string[];
  allow_newlines: boolean;
};

/**
 * A property that stores a primitive value (excluding annotated_text).
 */
export type PrimitiveProperty = {
  [K in Exclude<PrimitiveType, 'annotated_text'>]: { type: K }
}[Exclude<PrimitiveType, 'annotated_text'>];

/**
 * A property that stores a reference to a single node.
 */
export type NodeProperty = {
  type: "node";
  node_types: string[];
  default_node_type?: string;
};

/**
 * A property that stores an array of node references.
 */
export type NodeArrayProperty = {
  type: "node_array";
  node_types: string[];
  default_node_type?: string;
};

/**
 * Union type for all possible property definitions.
 */
export type PropertyDefinition = PrimitiveProperty | AnnotatedTextProperty | NodeProperty | NodeArrayProperty;

/**
 * Node kind values for different types of content nodes
 */
export type NodeKind = 'document' | 'block' | 'text' | 'annotation';

/**
 * Schema for text nodes - must have a content property of type annotated_text
 */
export type TextNodeSchema = {
  kind: 'text';
  properties: {
    content: AnnotatedTextProperty;
  } & Record<string, PropertyDefinition>;
};

/**
 * Schema for non-text nodes
 */
export type NonTextNodeSchema = {
  kind: 'document' | 'block' | 'annotation';
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
 * A serialized node in the document format.
 * Must have id and type properties, with other properties defined by the schema.
 */
export type SerializedNode = {
  id: string;
  type: string;
  [key: string]: any;
};

/**
 * The document serialization format - an array of serialized nodes.
 * Nodes must be ordered so that referenced nodes come before nodes that reference them.
 */
export type SerializedDocument = SerializedNode[];

/**
 * Props for the AnnotatedTextProperty component
 */
export type AnnotatedTextPropertyProps = {
  /** The full path to the property */
  path: DocumentPath;
  /** The `class` attribute on the content element */
  class?: string;
  /** A placeholder to be rendered for empty content */
  placeholder?: string;
};

/**
 * Props for the CustomProperty component
 */
export type CustomPropertyProps = {
  /** The full path to the property */
  path: DocumentPath;
  /** The `class` attribute on the content element */
  class?: string;
  /** The content of the custom property (e.g. an image) */
  children: Snippet;
};

/**
 * Props for the NodeArray component
 */
export type NodeArrayPropertyProps = {
  /** The full path to the property */
  path: DocumentPath;
  /** The `class` attribute on the container element */
  class?: string;
};

/**
 * Props for the Node component
 */
export type NodeProps = {
  /** The full path to the node */
  path: DocumentPath;
  /** The type-specific content of the node */
  children: Snippet;
};

/**
 * Props for the CustomProperty component
 */
export type CustomPropertyProps = {
  /** The full path to the property */
  path: DocumentPath;
  /** The `class` attribute on the content element */
  class?: string;
  /** The content of the custom property (e.g. an image) */
  children: Snippet;
};

/**
 * Props for the CustomProperty component
 */
export type SveditProps = {
  /** The full path to the property */
  doc: Document,
  /** Determines wether the document should be editable or read-only. */
  editable?: boolean,
  /** The path to the root element (e.g. ['page_1']) */
  path: DocumentPath,
  /** The `class` attribute on the canvas element */
  class?: string;
  /** The `autocapitalize` attribute on the canvas element */
  autocapitalize?: 'on' | 'off';
  /** The `spellcheck` attribute on the canvas element */
  spellcheck?: 'true' | 'false';
  /** A ref to the canvas element */
  canvas_ref?: HTMLElement;
};

/**
 * Represents an annotation in an annotated string
 */
export type Annotation = {
  start_offset: number;
  end_offset: number;
  node_id: NodeId;
};

/**
 * Represents an annotated text with text and annotations
 */
export type AnnotatedText = {
  text: string;
  annotations: Array<Annotation>;
};

/**
 * Represents a fragment of annotated text content
 */
export type AnnotationFragment = string | {
  /** NodeId that has annotation type and details */
  node: any;
  /** The text content of the annotation */
  content: string;
  /** Index of the annotation in the original array */
  annotation_index: number;
};
