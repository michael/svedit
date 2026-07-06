import { Session, compose, fill_document_defaults } from 'svedit';
import nanoid from './nanoid.js';
import doc from './demo_doc.js';

// System components
import Overlays from './components/Overlays.svelte';

// Packages: each groups everything one concern needs (schema entries incl.
// sub-node types, components, inserters, exporters, commands, keymaps).
// `compose` merges them into the flat schema + config a Session expects.
// Container wiring (which node types the page body accepts) lives in the
// page package — packages define node types, the app composes them.
import page_pkg from './packages/page/package.js';
import text_blocks_pkg from './packages/text_blocks/package.js';
import marks_pkg from './packages/marks/package.js';
import marker_pkg from './packages/marker/package.js';
import story_pkg from './packages/story/package.js';
import list_pkg from './packages/list/package.js';
import image_grid_pkg from './packages/image_grid/package.js';
import hero_pkg from './packages/hero/package.js';
import core_pkg from './packages/core/package.js';

const { schema, config } = compose(
	[
		page_pkg,
		text_blocks_pkg,
		marks_pkg,
		marker_pkg,
		story_pkg,
		list_pkg,
		image_grid_pkg,
		hero_pkg,
		core_pkg
	],
	{
		// Custom ID generator function
		generate_id: nanoid,
		// Provide overrides for system components (node_gap, node_gap_markers,
		// node_selection_markers) or user-land overlays (link previews, etc.)
		system_components: {
			overlays: Overlays
		},
		// Toggle view classes for the editor. On by default.
		view_classes: true,
		handle_property_deletion: (tr, path) => {
			const property_definition = tr.inspect(path);
			if (property_definition?.type !== 'string' || property_definition?.name !== 'image') return;
			tr.set(path, '');
		},
		handle_media_paste: async (doc, pasted_media) => {
			// ATTENTION: In a real-world-app, you may want to upload `pasted_media` here,
			// before referencing them from the document.

			if (doc.selection.type === 'property') {
				const property_definition = doc.inspect(doc.selection.path);
				if (property_definition.name === 'image') {
					const tr = doc.tr;
					tr.set(doc.selection.path, pasted_media[0].data_url);
					doc.apply(tr);
				}
				return null;
			} else {
				const pasted_json = { main_nodes: [], nodes: {} };
				// When caret inside an image grid we want to insert an image_grid_item
				// otherwise we want to insert a story, as that is the only body node,
				// that can carry an image.
				let target_node_type;
				if (doc.can_insert('image_grid_item')) {
					target_node_type = 'image_grid_item';
				} else {
					target_node_type = 'story';
				}
				for (let i = 0; i < pasted_media.length; i++) {
					const pasted_image = pasted_media[i];
					pasted_json.nodes['node_' + i] = {
						id: 'node_' + i,
						type: target_node_type,
						image: pasted_image.data_url
					};
					pasted_json.main_nodes.push('node_' + i);
				}
				return pasted_json;
			}
		}
	}
);

export const document_schema = schema;
export const session_config = config;

export default function create_demo_session() {
	const demo_doc = fill_document_defaults(doc, document_schema);
	const session = new Session(document_schema, demo_doc, session_config);
	return session;
}
