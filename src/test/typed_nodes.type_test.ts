/**
 * Compile-time tests for the schema-derived node types in lib/types.ts.
 *
 * This file contains no runnable tests — it is verified by `npm run check`.
 * If any assertion here breaks, svelte-check fails the build.
 *
 * Validates that:
 * 1. `define_document_schema` preserves literal property types through inference
 * 2. `NodeOfType` maps schema property definitions to runtime value types
 * 3. `AnyNode` forms a discriminated union that narrows on `node.type`
 * 4. `assert_node_type` returns an exact node type
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- compile-time type assertions are intentionally unused */

import { define_document_schema } from '../lib/doc_utils.js';
import { assert_node_type } from '../lib/types.js';
import type { AnnotatedText, AnnotatedNodeArray, NodeOfType, AnyNode, NodeMap } from '../lib/types.js';

const test_schema = define_document_schema({
	page: {
		kind: 'document',
		properties: {
			body: { type: 'node_array', node_types: ['story', 'list'] },
			keywords: { type: 'string_array' }
		}
	},
	story: {
		kind: 'block',
		properties: {
			layout: { type: 'integer', default: 1 },
			title: { type: 'text', allow_newlines: false },
			description: { type: 'text', allow_newlines: true },
			image: { type: 'string' },
			buttons: { type: 'node_array', node_types: ['button'] }
		}
	},
	button: {
		kind: 'block',
		properties: {
			label: { type: 'text', allow_newlines: false },
			href: { type: 'string' }
		}
	},
	list: {
		kind: 'block',
		properties: {
			list_items: { type: 'node_array', node_types: ['list_item'] }
		}
	},
	list_item: {
		kind: 'text',
		properties: {
			content: { type: 'text', allow_newlines: true }
		}
	}
});

type TestSchema = typeof test_schema;
type Story = NodeOfType<TestSchema, 'story'>;
type Nodes = NodeMap<TestSchema>;

// Minimal type-assertion helpers (compile-time only)
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
	? true
	: false;
type Expect<T extends true> = T;

// 1. Property definitions map to the right value types
type _title_is_text = Expect<Equal<Story['title'], AnnotatedText>>;
type _image_is_string = Expect<Equal<Story['image'], string>>;
type _layout_is_number = Expect<Equal<Story['layout'], number>>;
type _buttons_is_node_array = Expect<Equal<Story['buttons'], AnnotatedNodeArray>>;
type _keywords_is_string_array = Expect<Equal<Nodes['page']['keywords'], string[]>>;

// 2. Unknown properties are rejected (this is the autocomplete guarantee)
declare const story: Story;
// @ts-expect-error - 'titel' does not exist on story
story.titel;

// 3. AnyNode narrows on the `type` discriminant
declare const some_node: AnyNode<TestSchema>;
if (some_node.type === 'story') {
	const title: AnnotatedText = some_node.title;
	void title;
}
if (some_node.type === 'list') {
	// @ts-expect-error - 'title' does not exist on list nodes
	some_node.title;
}

// 4. assert_node_type returns the exact type
declare function fake_get(path: (string | number)[]): AnyNode<TestSchema>;
const node = assert_node_type(fake_get(['page_1', 'body', 3]), 'story');
const description: AnnotatedText = node.description;
void description;
