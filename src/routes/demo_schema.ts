import { define_document_schema } from 'svedit';
import type { NodeMap } from 'svedit';

const ALL_MARKS = ['strong', 'emphasis', 'code', 'highlight', 'link'];
const TITLE_MARKS = ['emphasis', 'highlight'];

export const document_schema = define_document_schema({
	page: {
		kind: 'document',
		properties: {
			body: {
				type: 'node_array',
				node_types: [
					'paragraph',
					'heading_1',
					'heading_2',
					'heading_3',
					'story',
					'list',
					'image_grid',
					'hero'
				],
				mark_types: ['section'],
				annotation_types: ['marker'],
				default_node_type: 'paragraph'
			},
			keywords: { type: 'string_array' },
			daily_visitors: { type: 'integer_array' },
			created_at: { type: 'datetime' }
		}
	},
	hero: {
		kind: 'block',
		properties: {
			layout: { type: 'string', values: ['default'] as const, default: 'default' },
			title: { type: 'text', mark_types: TITLE_MARKS, allow_newlines: false },
			description: { type: 'text', mark_types: ALL_MARKS, allow_newlines: true },
			image: { type: 'string' }
		}
	},
	paragraph: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['default'] as const, default: 'default' },
			content: { type: 'text', mark_types: ALL_MARKS, allow_newlines: true }
		}
	},
	heading_1: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['default'] as const, default: 'default' },
			content: { type: 'text', mark_types: ALL_MARKS, allow_newlines: true }
		}
	},
	heading_2: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['default'] as const, default: 'default' },
			content: { type: 'text', mark_types: ALL_MARKS, allow_newlines: true }
		}
	},
	heading_3: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['default'] as const, default: 'default' },
			content: { type: 'text', mark_types: ALL_MARKS, allow_newlines: true }
		}
	},
	button: {
		kind: 'text',
		properties: {
			content: { type: 'text', mark_types: [], allow_newlines: false },
			href: { type: 'string' }
		}
	},
	story: {
		kind: 'block',
		properties: {
			layout: {
				type: 'string',
				values: ['image-left', 'image-right', 'stacked'] as const,
				default: 'image-left'
			},
			title: { type: 'text', mark_types: TITLE_MARKS, allow_newlines: false },
			description: { type: 'text', mark_types: ALL_MARKS, allow_newlines: true },
			buttons: {
				type: 'node_array',
				node_types: ['button'],
				default_node_type: 'button'
			},
			image: { type: 'string' }
		}
	},
	image_grid: {
		kind: 'block',
		properties: {
			layout: { type: 'string', values: ['default'] as const, default: 'default' },
			image_grid_items: {
				type: 'node_array',
				node_types: ['image_grid_item'],
				annotation_types: ['marker']
			}
		}
	},
	image_grid_item: {
		kind: 'block',
		properties: {
			image: { type: 'string' },
			title: { type: 'text', mark_types: TITLE_MARKS, allow_newlines: false },
			description: { type: 'text', mark_types: ALL_MARKS, allow_newlines: false }
		}
	},
	list_item: {
		kind: 'text',
		properties: {
			content: { type: 'text', mark_types: ALL_MARKS, allow_newlines: false }
		}
	},
	list: {
		kind: 'block',
		properties: {
			list_items: {
				type: 'node_array',
				node_types: ['list_item'],
				annotation_types: ['marker']
			},
			layout: {
				type: 'string',
				values: ['square', 'disc', 'decimal-leading-zero', 'lower-alpha', 'upper-roman'] as const,
				default: 'square'
			}
		}
	},
	link: { kind: 'mark', properties: { href: { type: 'string' } } },
	strong: { kind: 'mark', properties: {} },
	emphasis: { kind: 'mark', properties: {} },
	code: { kind: 'mark', properties: {} },
	highlight: { kind: 'mark', properties: {} },
	section: { kind: 'mark', properties: {} },
	marker: { kind: 'annotation', properties: {} }
});

/** Map from node type name to its runtime node shape. */
export type Nodes = NodeMap<typeof document_schema>;
