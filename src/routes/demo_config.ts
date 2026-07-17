import {
	SelectAllCommand,
	InsertDefaultNodeCommand,
	AddNewLineCommand,
	BreakTextNodeCommand,
	ToggleMarkCommand,
	ToggleAnnotationCommand,
	UndoCommand,
	RedoCommand,
	SelectParentCommand,
	define_keymap
} from 'svedit';
import type { DocumentNode } from 'svedit';
import type { Component } from 'svelte';
import { CycleLayoutCommand, CycleNodeTypeCommand, ToggleLinkCommand } from './commands.svelte.js';
import { document_schema } from './demo_schema.js';
import nanoid from './nanoid.js';

import Overlays from './components/Overlays.svelte';
import Page from './components/Page.svelte';
import Story from './components/Story.svelte';
import Button from './components/Button.svelte';
import Paragraph from './components/Paragraph.svelte';
import Heading1 from './components/Heading1.svelte';
import Heading2 from './components/Heading2.svelte';
import Heading3 from './components/Heading3.svelte';
import List from './components/List.svelte';
import ListItem from './components/ListItem.svelte';
import ImageGrid from './components/ImageGrid.svelte';
import ImageGridItem from './components/ImageGridItem.svelte';
import Hero from './components/Hero.svelte';
import Strong from './components/Strong.svelte';
import Emphasis from './components/Emphasis.svelte';
import Code from './components/Code.svelte';
import Highlight from './components/Highlight.svelte';
import Link from './components/Link.svelte';
import Section from './components/Section.svelte';

type NodeType = keyof typeof document_schema;
type AnnotationNodeType = {
	[T in NodeType]: (typeof document_schema)[T]['kind'] extends 'annotation' ? T : never;
}[NodeType];
type RenderableNodeType = Exclude<NodeType, AnnotationNodeType>;

// App-specific config object, always available via doc.config for introspection
export const app_config = {
	// Custom ID generator function
	generate_id: nanoid,
	// Provide overrides for system components (node_gap, node_gap_markers,
	// node_selection_markers) or user-land overlays (link previews, etc.)
	system_components: {
		overlays: Overlays
	},
	// Registry of components for each node type
	node_components: {
		page: Page,
		button: Button,
		paragraph: Paragraph,
		heading_1: Heading1,
		heading_2: Heading2,
		heading_3: Heading3,
		story: Story,
		list: List,
		list_item: ListItem,
		image_grid: ImageGrid,
		image_grid_item: ImageGridItem,
		hero: Hero,
		strong: Strong,
		emphasis: Emphasis,
		code: Code,
		highlight: Highlight,
		link: Link,
		section: Section
		// NOTE: `marker` must not have a component: it is an annotation, so it
		// is data-only and may overlap marks (e.g. a section) and other
		// annotations. Covered node wrappers get `anno-marker` classes
		// automatically — see styles/annotations.css for how it's styled with
		// pure CSS.
	} satisfies Record<RenderableNodeType, Component>,
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
			const pasted_json: { main_nodes: string[]; nodes: Record<string, DocumentNode> } = {
				main_nodes: [],
				nodes: {}
			};
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
	},

	// HTML exporters for different node types
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
		},

		list: (node, doc, html_exporters) => {
			const { list_item } = html_exporters;
			let html = '<ul>\n';
			for (const list_item_id of node.list_items.nodes) {
				html += list_item(doc.get(list_item_id), doc, html_exporters);
			}
			return html + '</ul>';
		},
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
		},
		button: (node) => {
			return `<a href="${node.href}">${node.content.content}</a>\n`;
		},
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
		},
		list_item: (node) => {
			const content =
				typeof node.content === 'object' && node.content.content
					? node.content.content
					: node.content || '';
			return `<li>${content}</li>\n`;
		}
	},
	// Custom functions to insert new "blank" nodes and setting the selection depening on the
	// intended behavior.
	inserters: {
		paragraph: function (tr, content, layout) {
			const new_paragraph: DocumentNode = {
				id: nanoid(),
				type: 'paragraph'
			};
			if (content !== undefined) new_paragraph.content = content;
			if (layout !== undefined) new_paragraph.layout = layout;
			tr.create(new_paragraph);
			tr.insert_nodes([new_paragraph.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		heading_1: function (tr, content, layout) {
			const new_heading_1: DocumentNode = {
				id: nanoid(),
				type: 'heading_1'
			};
			if (content !== undefined) new_heading_1.content = content;
			if (layout !== undefined) new_heading_1.layout = layout;
			tr.create(new_heading_1);
			tr.insert_nodes([new_heading_1.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		heading_2: function (tr, content, layout) {
			const new_heading_2: DocumentNode = {
				id: nanoid(),
				type: 'heading_2'
			};
			if (content !== undefined) new_heading_2.content = content;
			if (layout !== undefined) new_heading_2.layout = layout;
			tr.create(new_heading_2);
			tr.insert_nodes([new_heading_2.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		heading_3: function (tr, content, layout) {
			const new_heading_3: DocumentNode = {
				id: nanoid(),
				type: 'heading_3'
			};
			if (content !== undefined) new_heading_3.content = content;
			if (layout !== undefined) new_heading_3.layout = layout;
			tr.create(new_heading_3);
			tr.insert_nodes([new_heading_3.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		story: function (tr) {
			const new_button: DocumentNode = {
				id: nanoid(),
				type: 'button'
			};
			tr.create(new_button);
			const new_story: DocumentNode = {
				id: nanoid(),
				type: 'story',
				buttons: { nodes: [new_button.id], marks: [], annotations: [] }
			};
			tr.create(new_story);
			tr.insert_nodes([new_story.id]);
		},
		list: function (tr) {
			const new_list_item: DocumentNode = {
				id: nanoid(),
				type: 'list_item'
			};
			tr.create(new_list_item);
			const new_list: DocumentNode = {
				id: nanoid(),
				type: 'list',
				list_items: { nodes: [new_list_item.id], marks: [], annotations: [] },
				layout: 'decimal-leading-zero'
			};
			tr.create(new_list);
			tr.insert_nodes([new_list.id]);
		},
		list_item: function (tr, content) {
			const new_list_item: DocumentNode = {
				id: nanoid(),
				type: 'list_item'
			};
			if (content !== undefined) new_list_item.content = content;
			tr.create(new_list_item);
			tr.insert_nodes([new_list_item.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},

		image_grid: function (tr) {
			const new_image_grid_items = [];
			for (let i = 0; i < 6; i++) {
				const image_grid_item: DocumentNode = {
					id: nanoid(),
					type: 'image_grid_item'
				};
				tr.create(image_grid_item);
				new_image_grid_items.push(image_grid_item.id);
			}
			const new_image_grid: DocumentNode = {
				id: nanoid(),
				type: 'image_grid',
				image_grid_items: { nodes: new_image_grid_items, marks: [], annotations: [] }
			};
			tr.create(new_image_grid);
			tr.insert_nodes([new_image_grid.id]);
		},
		image_grid_item: function (tr) {
			const new_image_grid_item: DocumentNode = {
				id: nanoid(),
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
		},
		button: function (tr, content) {
			const new_button: DocumentNode = {
				id: nanoid(),
				type: 'button'
			};
			if (content !== undefined) new_button.content = content;
			tr.create(new_button);
			tr.insert_nodes([new_button.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		hero: function (tr) {
			const new_hero: DocumentNode = {
				id: nanoid(),
				type: 'hero'
			};
			tr.create(new_hero);
			tr.insert_nodes([new_hero.id]);
		}
	},

	/**
	 * Factory function to create Svedit commands and keymap.
	 * Called by Svedit component with the svedit context.
	 */
	create_commands_and_keymap: (context: import('./commands.svelte.js').AppCommandContext) => {
		// Create command instances with the provided context
		const commands = {
			select_all: new SelectAllCommand(context),
			insert_default_node: new InsertDefaultNodeCommand(context),
			add_new_line: new AddNewLineCommand(context),
			break_text_node: new BreakTextNodeCommand(context),
			toggle_strong: new ToggleMarkCommand('strong', context),
			toggle_emphasis: new ToggleMarkCommand('emphasis', context),
			toggle_code: new ToggleMarkCommand('code', context),
			toggle_highlight: new ToggleMarkCommand('highlight', context),
			toggle_link: new ToggleLinkCommand(context),
			toggle_section: new ToggleMarkCommand('section', context),
			// Annotations only compete with same-type annotations, so the
			// marker toggle never conflicts with sections or other marks.
			toggle_marker: new ToggleAnnotationCommand('marker', context),
			undo: new UndoCommand(context),
			redo: new RedoCommand(context),
			select_parent: new SelectParentCommand(context),
			next_layout: new CycleLayoutCommand('next', context),
			previous_layout: new CycleLayoutCommand('previous', context),
			next_type: new CycleNodeTypeCommand('next', context),
			previous_type: new CycleNodeTypeCommand('previous', context)
		};

		// Define keymap binding keys to commands
		const keymap = define_keymap({
			'meta+a,ctrl+a': [commands.select_all],
			enter: [commands.break_text_node, commands.add_new_line, commands.insert_default_node],
			'shift+enter': [commands.add_new_line],
			'meta+b,ctrl+b': [commands.toggle_strong],
			'meta+i,ctrl+i': [commands.toggle_emphasis],
			'meta+shift+c,ctrl+shift+c': [commands.toggle_code],
			'meta+u,ctrl+u': [commands.toggle_highlight],
			'meta+k,ctrl+k': [commands.toggle_link],
			'meta+shift+s,ctrl+shift+s': [commands.toggle_section],
			'meta+shift+m,ctrl+shift+m': [commands.toggle_marker],
			'meta+z,ctrl+z': [commands.undo],
			'meta+shift+z,ctrl+shift+z': [commands.redo],
			escape: [commands.select_parent],
			'ctrl+shift+arrowright': [commands.next_layout],
			'ctrl+shift+arrowleft': [commands.previous_layout],
			'ctrl+shift+arrowdown': [commands.next_type],
			'ctrl+shift+arrowup': [commands.previous_type]
		});

		return { commands, keymap };
	}
};
