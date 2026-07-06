import Page from '../components/Page.svelte';

// The page package owns all container wiring: which node types are allowed in
// the body, which marks/annotations may wrap body ranges, and what gets
// inserted by default. Packages define node types; the app composes them.
export default {
	name: 'page',
	schema: {
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
				keywords: {
					type: 'string_array'
				},
				daily_visitors: {
					type: 'integer_array'
				},
				created_at: {
					type: 'datetime'
				}
			}
		}
	},
	node_components: {
		page: Page
	}
};
