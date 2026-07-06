import Paragraph from './Paragraph.svelte';
import Heading1 from './Heading1.svelte';
import Heading2 from './Heading2.svelte';
import Heading3 from './Heading3.svelte';
import { ALL_MARKS } from '../marks/package.js';

// Text blocks need no inserters: Svedit's generic schema-driven inserter
// creates them from schema defaults and places the caret in `content`.
export default {
	name: 'text_blocks',
	schema: {
		paragraph: {
			kind: 'text',
			properties: {
				layout: { type: 'integer', default: 1 },
				content: {
					type: 'text',
					mark_types: ALL_MARKS,
					allow_newlines: true
				}
			}
		},
		heading_1: {
			kind: 'text',
			properties: {
				layout: { type: 'integer', default: 1 },
				content: {
					type: 'text',
					mark_types: ALL_MARKS,
					allow_newlines: true
				}
			}
		},
		heading_2: {
			kind: 'text',
			properties: {
				layout: { type: 'integer', default: 1 },
				content: {
					type: 'text',
					mark_types: ALL_MARKS,
					allow_newlines: true
				}
			}
		},
		heading_3: {
			kind: 'text',
			properties: {
				layout: { type: 'integer', default: 1 },
				content: {
					type: 'text',
					mark_types: ALL_MARKS,
					allow_newlines: true
				}
			}
		}
	},
	node_components: {
		paragraph: Paragraph,
		heading_1: Heading1,
		heading_2: Heading2,
		heading_3: Heading3
	},
	node_layouts: {
		paragraph: 1,
		heading_1: 1,
		heading_2: 1,
		heading_3: 1
	},
	html_exporters: {
		paragraph: (node) => {
			return `<p>${node.content.content}</p>\n`;
		},
		heading_1: (node) => {
			return `<h1>${node.content.content}</h1>\n`;
		},
		heading_2: (node) => {
			return `<h2>${node.content.content}</h2>\n`;
		},
		heading_3: (node) => {
			return `<h3>${node.content.content}</h3>\n`;
		}
	}
};
