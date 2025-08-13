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
 * Union type for all possible selection types
 */
export type Selection = TextSelection | NodeSelection;

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
export type RichType = "annotated_string";

/**
 * Node reference types for linking to other nodes.
 */
export type NodeType = "node" | "node_array";

/**
 * All primitive types that can be used in property definitions.
 */
export type PrimitiveType = ScalarType | ArrayType | RichType | NodeType;

/**
 * Document schema primitive types - all possible property types in document schemas.
 */
export type DocumentSchemaPrimitive = "string" | "number" | "boolean" | "integer" | "datetime" | "string_array" | "number_array" | "boolean_array" | "integer_array" | "annotated_string" | "node" | "node_array";

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
  T extends "annotated_string" ? [string, Array<any>] :
  T extends "node" ? string :
  T extends "node_array" ? Array<string> :
  never;

/**
 * Converts a document node schema definition to its inferred JS type.
 * Handles the {type: "..."} wrapper structure used in document schemas.
 */
export type DocumentNodeToJs<S extends Record<string, {type: DocumentSchemaPrimitive}>> =
  { id: string, type: string } & { [K in keyof S]: DocumentSchemaValueToJs<S[K]["type"]> };

/**
 * A property that stores a primitive value.
 */
export type PrimitiveProperty = {
  type: PrimitiveType;
};

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
export type PropertyDefinition = PrimitiveProperty | NodeProperty | NodeArrayProperty;

/**
 * A node schema defines the structure of a specific node type.
 * Maps property names to their definitions.
 */
export type NodeSchema = Record<string, PropertyDefinition>;

/**
 * A document schema defines all node types available in a document.
 * Maps node type names to their schemas.
 */
export type DocumentSchema = Record<string, NodeSchema>;
