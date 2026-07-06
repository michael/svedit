import Story from '../components/Story.svelte';
import Button from '../components/Button.svelte';
import { ALL_MARKS, TITLE_MARKS } from './marks.js';

export default {
	name: 'story',
	schema: {
		story: {
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
				buttons: {
					type: 'node_array',
					node_types: ['button'],
					default_node_type: 'button'
				},
				image: { type: 'string' }
			}
		},
		button: {
			kind: 'text',
			properties: {
				content: {
					type: 'text',
					mark_types: [],
					allow_newlines: false
				},
				href: { type: 'string' }
			}
		}
	},
	node_components: {
		story: Story,
		button: Button
	},
	node_layouts: {
		story: 3,
		button: 1
	},
	inserters: {
		// Custom: a new story is seeded with a nested button, which schema
		// defaults alone can't express.
		story: function (tr) {
			const new_button = {
				id: tr.generate_id(),
				type: 'button'
			};
			tr.create(new_button);
			const new_story = {
				id: tr.generate_id(),
				type: 'story',
				buttons: { nodes: [new_button.id], marks: [], annotations: [] }
			};
			tr.create(new_story);
			tr.insert_nodes([new_story.id]);
		}
	},
	html_exporters: {
		story: (node, doc, html_exporters) => {
			const { button } = html_exporters;
			let html = '';
			if (node.image) {
				html += `<img src="${node.image}" alt="${node.title.content}" style="max-width: 200px; height: auto;" />\n`;
			}
			html += `<h2>${node.title.content}</h2>\n`;
			if (node.description) {
				html += `<p>${node.description.content}</p>\n`;
			}
			for (const button_id of node.buttons.nodes) {
				html += button(doc.get(button_id), doc, html_exporters);
			}
			return html;
		},
		button: (node) => {
			return `<a href="${node.href}">${node.content.content}</a>\n`;
		}
	}
};
