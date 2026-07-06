import List from './List.svelte';
import ListItem from './ListItem.svelte';
import { ALL_MARKS } from '../marks/package.js';

export default {
	name: 'list',
	schema: {
		list: {
			kind: 'block',
			properties: {
				list_items: {
					type: 'node_array',
					node_types: ['list_item'],
					annotation_types: ['marker']
				},
				layout: { type: 'integer', default: 1 }
			}
		},
		list_item: {
			kind: 'text',
			properties: {
				content: {
					type: 'text',
					mark_types: ALL_MARKS,
					allow_newlines: false
				}
			}
		}
	},
	node_components: {
		list: List,
		list_item: ListItem
	},
	node_layouts: {
		list: 5,
		list_item: 1
	},
	inserters: {
		// Custom: a new list is seeded with one empty item; list_item itself
		// uses the generic schema-driven inserter.
		list: function (tr) {
			const new_list_item = {
				id: tr.generate_id(),
				type: 'list_item'
			};
			tr.create(new_list_item);
			const new_list = {
				id: tr.generate_id(),
				type: 'list',
				list_items: { nodes: [new_list_item.id], marks: [], annotations: [] },
				layout: 3
			};
			tr.create(new_list);
			tr.insert_nodes([new_list.id]);
		}
	},
	html_exporters: {
		list: (node, doc, html_exporters) => {
			const { list_item } = html_exporters;
			let html = '<ul>\n';
			for (const list_item_id of node.list_items.nodes) {
				html += list_item(doc.get(list_item_id), doc, html_exporters);
			}
			return html + '</ul>';
		},
		list_item: (node) => {
			const content =
				typeof node.content === 'object' && node.content.content
					? node.content.content
					: node.content || '';
			return `<li>${content}</li>\n`;
		}
	}
};
