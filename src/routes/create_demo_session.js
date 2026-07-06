import {
	Session,
	SelectAllCommand,
	InsertDefaultNodeCommand,
	AddNewLineCommand,
	BreakTextNodeCommand,
	ToggleMarkCommand,
	ToggleAnnotationCommand,
	UndoCommand,
	RedoCommand,
	SelectParentCommand,
	define_document_schema,
	fill_document_defaults,
	define_keymap
} from 'svedit';
import { CycleLayoutCommand, CycleNodeTypeCommand, ToggleLinkCommand } from './commands.svelte.js';
import nanoid from './nanoid.js';

// System components
import Overlays from './components/Overlays.svelte';

// Node components
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
import Highlight from './components/Highlight.svelte';
import Link from './components/Link.svelte';
import Section from './components/Section.svelte';

const ALL_MARKS = ['strong', 'emphasis', 'highlight', 'link'];
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
	},
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
	},
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
	},
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
	},
	list: {
		kind: 'block',
		properties: {
			list_items: {
				type: 'node_array',
				node_types: ['list_item'],
				annotation_types: ['marker'],
			},
			layout: { type: 'integer', default: 1 }
		}
	},
	link: {
		kind: 'mark',
		properties: {
			href: { type: 'string' }
		}
	},
	strong: {
		kind: 'mark',
		properties: {}
	},
	emphasis: {
		kind: 'mark',
		properties: {}
	},
	highlight: {
		kind: 'mark',
		properties: {}
	},
	section: {
		kind: 'mark',
		properties: {}
	},
	// An annotation: data-only, no component allowed, so it may overlap marks
	// and other annotations. Covered node wrappers get `anno-marker` classes
	// automatically, styled in styles/annotations.css.
	marker: {
		kind: 'annotation',
		properties: {}
	}
});

const doc = {
	document_id: 'page_1',
	nodes: {
		zXfRSCtGrGWaBCpaWdBvdZG: {
			id: 'zXfRSCtGrGWaBCpaWdBvdZG',
			type: 'link',
			href: 'https://editable.website'
		},
		hero_1: {
			id: 'hero_1',
			type: 'hero',
			layout: 1,
			title: {
				content: 'Svedit',
				marks: [],
				annotations: []
			},
			description: {
				content: 'A tiny library for building editable websites in Svelte.',
				marks: [
					{
						start_offset: 28,
						end_offset: 36,
						node_id: 'zXfRSCtGrGWaBCpaWdBvdZG'
					}
				],
				annotations: []
			},
			image: ''
		},
		heading_1: {
			id: 'heading_1',
			type: 'heading_1',
			layout: 1,
			content: {
				content: 'Text and structured content in symbiosis',
				marks: [],
				annotations: []
			}
		},
		paragraph_1: {
			id: 'paragraph_1',
			type: 'paragraph',
			layout: 1,
			content: {
				content:
					"Unlike most rich text editors, Svedit isn't restricted to a linear character-based model for addressing content and caret positions. For that reason we can combine text-ish content like a paragraph or heading with structured, form-like content.",
				marks: [],
				annotations: []
			}
		},
		JRZfuWeXnWKnWHaNtjupSsX: {
			id: 'JRZfuWeXnWKnWHaNtjupSsX',
			type: 'button',
			content: {
				content: 'Get started',
				marks: [],
				annotations: []
			},
			href: 'https://github.com/michael/svedit'
		},
		story_1: {
			id: 'story_1',
			type: 'story',
			layout: 1,
			image: '/images/editable.svg',
			title: {
				content: 'Visual in‑place editing',
				marks: [],
				annotations: []
			},
			description: {
				content:
					'Model your content in JSON, render it with Svelte components, and edit content directly in the layout. You only have to follow a couple of rules to make this work.',
				marks: [],
				annotations: []
			},
			buttons: {
				nodes: ['JRZfuWeXnWKnWHaNtjupSsX'],
				marks: [],
				annotations: []
			}
		},
		link_1: {
			id: 'link_1',
			type: 'link',
			href: 'https://editable.website'
		},
		story_2: {
			id: 'story_2',
			type: 'story',
			layout: 2,
			image: '/images/lightweight.svg',
			title: {
				content: 'Minimal viable editor',
				marks: [],
				annotations: []
			},
			description: {
				content:
					"The reference implementation uses only about 2000 lines of code. That means you'll be able to serve editable web pages, removing the need for a separate Content Management System.",
				marks: [
					{
						start_offset: 100,
						end_offset: 118,
						node_id: 'link_1'
					}
				],
				annotations: []
			},
			buttons: {
				nodes: [],
				marks: [],
				annotations: []
			}
		},
		image_grid_item_1: {
			id: 'image_grid_item_1',
			type: 'image_grid_item',
			image: '/images/svelte-framework.svg',
			title: {
				content: 'Svelte-native editing',
				marks: [],
				annotations: []
			},
			description: {
				content: "No mingling with 3rd-party rendering API's.",
				marks: [],
				annotations: []
			}
		},
		image_grid_item_2: {
			id: 'image_grid_item_2',
			type: 'image_grid_item',
			image: '/images/annotations.svg',
			title: {
				content: 'Marks and annotations',
				marks: [],
				annotations: []
			},
			description: {
				content:
					'Wrap ranges in marks (e.g. links) and attach annotations (e.g. comments) at a separate layer.',
				marks: [],
				annotations: []
			}
		},
		image_grid_item_3: {
			id: 'image_grid_item_3',
			type: 'image_grid_item',
			image: '/images/graphmodel.svg',
			title: {
				content: 'Graph‑first content with nested nodes',
				marks: [],
				annotations: []
			},
			description: {
				content:
					'From simple paragraphs to complex nodes with nested arrays and multiple properties.',
				marks: [],
				annotations: []
			}
		},
		image_grid_item_4: {
			id: 'image_grid_item_4',
			type: 'image_grid_item',
			image: '/images/dom-synced.svg',
			title: {
				content: 'DOM ↔ model selections match',
				marks: [],
				annotations: []
			},
			description: {
				content: 'Avoids flaky mapping layers found in other editors.',
				marks: [],
				annotations: []
			}
		},
		image_grid_item_5: {
			id: 'image_grid_item_5',
			type: 'image_grid_item',
			image: '/images/cjk.svg',
			title: {
				content: 'Unicode‑safe, composition‑safe input',
				marks: [],
				annotations: []
			},
			description: {
				content: 'Works correctly with emoji, diacritics, and CJK.',
				marks: [],
				annotations: []
			}
		},
		image_grid_item_6: {
			id: 'image_grid_item_6',
			type: 'image_grid_item',
			image: '/images/timetravel.svg',
			title: {
				content: 'Transactional editing with time travel',
				marks: [],
				annotations: []
			},
			description: {
				content: 'Every change is safe and undoable.',
				marks: [],
				annotations: []
			}
		},
		image_grid_1: {
			id: 'image_grid_1',
			type: 'image_grid',
			layout: 1,
			image_grid_items: {
				nodes: [
					'image_grid_item_1',
					'image_grid_item_2',
					'image_grid_item_3',
					'image_grid_item_4',
					'image_grid_item_5',
					'image_grid_item_6'
				],
				marks: [],
				annotations: []
			}
		},
		story_3: {
			id: 'story_3',
			type: 'story',
			layout: 1,
			image: '/images/nested-blocks-illustration.svg',
			title: {
				content: 'Nested nodes',
				marks: [],
				annotations: []
			},
			description: {
				content:
					'A node can embed a node_array of other nodes. For instance the list node at the bottom of the page has a node_array of list items.',
				marks: [],
				annotations: []
			},
			buttons: {
				nodes: [],
				marks: [],
				annotations: []
			}
		},
		story_4: {
			id: 'story_4',
			type: 'story',
			layout: 2,
			image: '/images/node-carets.svg',
			title: {
				content: 'Node carets',
				marks: [],
				annotations: []
			},
			description: {
				content:
					'They work just like text carets, but instead of a character position in a string they address a node position in a node_array.\n\nTry it by selecting one of the gaps between the nodes. Then press ↵ to insert a new node or ⌫ to delete the node before the caret.',
				marks: [],
				annotations: []
			},
			buttons: {
				nodes: [],
				marks: [],
				annotations: []
			}
		},
		link_2: {
			id: 'link_2',
			type: 'link',
			href: 'https://svelte.dev'
		},
		emphasis_1: {
			id: 'emphasis_1',
			type: 'emphasis'
		},
		story_5: {
			id: 'story_5',
			type: 'story',
			layout: 1,
			image: '/images/svelte-logo.svg',
			title: {
				content: 'Made for Svelte 5',
				marks: [],
				annotations: []
			},
			description: {
				content:
					'Integrate with your Svelte application. Use it as a template and copy and paste Svedit.svelte to build your custom rich content editor.',
				marks: [
					{
						start_offset: 20,
						end_offset: 26,
						node_id: 'link_2'
					},
					{
						start_offset: 80,
						end_offset: 93,
						node_id: 'emphasis_1'
					}
				],
				annotations: []
			},
			buttons: {
				nodes: [],
				marks: [],
				annotations: []
			}
		},
		story_6: {
			id: 'story_6',
			type: 'story',
			layout: 2,
			image: '/images/extendable.svg',
			title: {
				content: 'Alpha version',
				marks: [],
				annotations: []
			},
			description: {
				content:
					"Expect bugs. Expect missing features. Expect the need for more work on your part to make this work for your use case.\n\nFind below a list of known issues we'll be working to get fixed next:",
				marks: [],
				annotations: []
			},
			buttons: {
				nodes: [],
				marks: [],
				annotations: []
			}
		},
		list_item_1: {
			id: 'list_item_1',
			type: 'list_item',
			content: {
				content:
					"It's a bit hard to select whole lists or image grids with the mouse still. We're looking to improve this. However, by pressing the ESC key (or CMD+A) several times you can reach parent nodes easily.",
				marks: [],
				annotations: []
			}
		},
		list_item_2: {
			id: 'list_item_2',
			type: 'list_item',
			content: {
				content:
					'Copy and pasting from and to external sources is working in principle, but is only capturing plain text so far.',
				marks: [],
				annotations: []
			}
		},
		list_item_3: {
			id: 'list_item_3',
			type: 'list_item',
			content: {
				content:
					'Works best in Chrome, Safari 26+, and Firefox 157+, as Svedit uses CSS Anchor Positioning for overlays.',
				marks: [],
				annotations: []
			}
		},
		list_item_4: {
			id: 'list_item_4',
			type: 'list_item',
			content: {
				content:
					"Mobile support ist still experimental. As of 0.3.0 Svedit works on latest iOS and Android, but the UX isn't optimized yet.",
				marks: [],
				annotations: []
			}
		},
		list_1: {
			id: 'list_1',
			type: 'list',
			list_items: {
				nodes: ['list_item_1', 'list_item_2', 'list_item_3', 'list_item_4'],
				marks: [],
				annotations: []
			},
			layout: 3
		},
		link_4: {
			id: 'link_4',
			type: 'link',
			href: 'https://michaelaufreiter.com'
		},
		link_5: {
			id: 'link_5',
			type: 'link',
			href: 'https://mutter.co'
		},
		VgWNyDmWcpgtkHvZXhjYTPS: {
			id: 'VgWNyDmWcpgtkHvZXhjYTPS',
			type: 'link',
			href: 'https://github.com/michael/svedit/'
		},
		story_7: {
			id: 'story_7',
			type: 'story',
			layout: 1,
			image: '/images/github.svg',
			title: {
				content: 'Find us on GitHub',
				marks: [],
				annotations: []
			},
			description: {
				content:
					'Thank you for all the stars on GitHub. Svedit is made by Michael Aufreiter and Johannes Mutter and is licensed under the MIT License.',
				marks: [
					{
						start_offset: 57,
						end_offset: 74,
						node_id: 'link_4'
					},
					{
						start_offset: 79,
						end_offset: 94,
						node_id: 'link_5'
					},
					{
						start_offset: 31,
						end_offset: 37,
						node_id: 'VgWNyDmWcpgtkHvZXhjYTPS'
					}
				],
				annotations: []
			},
			buttons: {
				nodes: [],
				marks: [],
				annotations: []
			}
		},
		section_1: {
			id: 'section_1',
			type: 'section'
		},
		page_1: {
			id: 'page_1',
			type: 'page',
			body: {
				nodes: [
					'hero_1',
					'heading_1',
					'paragraph_1',
					'story_1',
					'story_2',
					'image_grid_1',
					'story_3',
					'story_4',
					'story_5',
					'story_6',
					'list_1',
					'story_7'
				],
				marks: [
					{
						start_offset: 0,
						end_offset: 1,
						node_id: 'section_1'
					}
				],
				annotations: []
			},
			keywords: ['svelte', 'editor', 'rich content'],
			daily_visitors: [10, 20, 30, 100],
			created_at: '2025-05-30T10:39:59.987Z'
		}
	}
};

// App-specific config object, always available via doc.config for introspection
export const session_config = {
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
		highlight: Highlight,
		link: Link,
		section: Section
		// NOTE: `marker` must not have a component: it is an annotation, so it
		// is data-only and may overlap marks (e.g. a section) and other
		// annotations. Covered node wrappers get `anno-marker` classes
		// automatically — see styles/annotations.css for how it's styled with
		// pure CSS.
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
	node_layouts: {
		button: 1,
		paragraph: 1,
		heading_1: 1,
		heading_2: 1,
		heading_3: 1,
		story: 3,
		list: 5,
		list_item: 1,
		image_grid: 1,
		hero: 1
	},
	// Custom functions to insert new "blank" nodes and setting the selection depening on the
	// intended behavior.
	inserters: {
		paragraph: function (tr, content, layout) {
			const new_paragraph = {
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
			const new_heading_1 = {
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
			const new_heading_2 = {
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
			const new_heading_3 = {
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
			const new_button = {
				id: nanoid(),
				type: 'button'
			};
			tr.create(new_button);
			const new_story = {
				id: nanoid(),
				type: 'story',
				buttons: { nodes: [new_button.id], marks: [], annotations: [] }
			};
			tr.create(new_story);
			tr.insert_nodes([new_story.id]);
		},
		list: function (tr) {
			const new_list_item = {
				id: nanoid(),
				type: 'list_item'
			};
			tr.create(new_list_item);
			const new_list = {
				id: nanoid(),
				type: 'list',
				list_items: { nodes: [new_list_item.id], marks: [], annotations: [] },
				layout: 3
			};
			tr.create(new_list);
			tr.insert_nodes([new_list.id]);
		},
		list_item: function (tr, content) {
			const new_list_item = {
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
				const image_grid_item = {
					id: nanoid(),
					type: 'image_grid_item'
				};
				tr.create(image_grid_item);
				new_image_grid_items.push(image_grid_item.id);
			}
			const new_image_grid = {
				id: nanoid(),
				type: 'image_grid',
				image_grid_items: { nodes: new_image_grid_items, marks: [], annotations: [] }
			};
			tr.create(new_image_grid);
			tr.insert_nodes([new_image_grid.id]);
		},
		image_grid_item: function (tr) {
			const new_image_grid_item = {
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
			const new_button = {
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
			const new_hero = {
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
	 *
	 * @param {object} context - The svedit context with doc, editable, canvas.
	 * @returns {{ commands: object, keymap: object }}
	 */
	create_commands_and_keymap: (context) => {
		// Create command instances with the provided context
		const commands = {
			select_all: new SelectAllCommand(context),
			insert_default_node: new InsertDefaultNodeCommand(context),
			add_new_line: new AddNewLineCommand(context),
			break_text_node: new BreakTextNodeCommand(context),
			toggle_strong: new ToggleMarkCommand('strong', context),
			toggle_emphasis: new ToggleMarkCommand('emphasis', context),
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

export default function create_demo_session() {
	const demo_doc = fill_document_defaults(doc, document_schema);
	const session = new Session(document_schema, demo_doc, session_config);
	return session;
}
