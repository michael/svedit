import ImageGrid from './ImageGrid.svelte';
import ImageGridItem from './ImageGridItem.svelte';
import { ALL_MARKS, TITLE_MARKS } from '../marks/package.js';

export default {
	name: 'image_grid',
	schema: {
		image_grid: {
			kind: 'block',
			properties: {
				layout: { type: 'integer', default: 1 },
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
				image: { type: 'string' }, // a dedicated type asset would be better
				title: {
					type: 'text',
					mark_types: TITLE_MARKS,
					allow_newlines: false
				},
				description: {
					type: 'text',
					mark_types: ALL_MARKS,
					allow_newlines: false
				}
			}
		}
	},
	node_components: {
		image_grid: ImageGrid,
		image_grid_item: ImageGridItem
	},
	node_layouts: {
		image_grid: 1
	},
	inserters: {
		// Custom: a new grid is seeded with six empty items.
		image_grid: function (tr) {
			const new_image_grid_items = [];
			for (let i = 0; i < 6; i++) {
				const image_grid_item = {
					id: tr.generate_id(),
					type: 'image_grid_item'
				};
				tr.create(image_grid_item);
				new_image_grid_items.push(image_grid_item.id);
			}
			const new_image_grid = {
				id: tr.generate_id(),
				type: 'image_grid',
				image_grid_items: { nodes: new_image_grid_items, marks: [], annotations: [] }
			};
			tr.create(new_image_grid);
			tr.insert_nodes([new_image_grid.id]);
		},
		// Custom: after inserting an item the caret collapses behind it
		// instead of keeping the new node selected.
		image_grid_item: function (tr) {
			const new_image_grid_item = {
				id: tr.generate_id(),
				type: 'image_grid_item'
			};
			tr.create(new_image_grid_item);
			tr.insert_nodes([new_image_grid_item.id]);
			tr.set_selection({
				type: 'node',
				path: [...tr.selection.path],
				anchor_offset: tr.selection.focus_offset,
				focus_offset: tr.selection.focus_offset
			});
		}
	},
	html_exporters: {
		image_grid_item: (node) => {
			let html = '<div class="image-grid-item">\n';
			if (node.image) {
				html += `<img src="${node.image}" alt="${node.title.content}" style="max-width: 200px; height: auto;" />\n`;
			}
			if (node.title.content.trim()) {
				html += `<h3>${node.title.content}</h3>\n`;
			}
			if (node.description.content.trim()) {
				html += `<p>${node.description.content}</p>\n`;
			}
			return html + '</div>';
		}
	}
};
