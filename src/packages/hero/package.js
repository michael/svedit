import Hero from './Hero.svelte';
import { ALL_MARKS, TITLE_MARKS } from '../marks/package.js';

// The hero needs no inserter: the generic schema-driven inserter creates it
// from schema defaults.
export default {
	name: 'hero',
	schema: {
		hero: {
			kind: 'block',
			properties: {
				layout: { type: 'integer', default: 1 },
				title: {
					type: 'text',
					mark_types: TITLE_MARKS,
					allow_newlines: false
				},
				description: {
					type: 'text',
					mark_types: ALL_MARKS,
					allow_newlines: true
				},
				image: { type: 'string' } // a dedicated type asset would be better
			}
		}
	},
	node_components: {
		hero: Hero
	},
	node_layouts: {
		hero: 1
	},
	html_exporters: {
		hero: (node) => {
			let html = '';
			if (node.title.content.trim()) {
				html += `<h1>${node.title.content}</h1>\n`;
			}
			if (node.description.content.trim()) {
				html += `<p>${node.description.content}</p>\n`;
			}
			return html;
		}
	}
};
