import Session from '../lib/Session.svelte.js';
import { define_document_schema } from '../lib/doc_utils.js';
import nanoid from '../routes/nanoid.js';

// Node components
import Page from '../routes/components/Page.svelte';
import Story from '../routes/components/Story.svelte';
import Button from '../routes/components/Button.svelte';
import Paragraph from '../routes/components/Paragraph.svelte';
import Heading1 from '../routes/components/Heading1.svelte';
import Heading2 from '../routes/components/Heading2.svelte';
import Heading3 from '../routes/components/Heading3.svelte';
import List from '../routes/components/List.svelte';
import ListItem from '../routes/components/ListItem.svelte';

const document_schema = define_document_schema({
	page: {
		kind: 'document',
		properties: {
			body: {
				type: 'node_array',
				node_types: ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'story', 'list'],
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
	button: {
		kind: 'text',
		properties: {
			content: { type: 'text', allow_newlines: false },
			href: { type: 'string' }
		}
	},
	paragraph: {
		kind: 'text',
		properties: {
			layout: { type: 'integer' },
			content: { type: 'text', allow_newlines: true }
		}
	},
	heading_1: {
		kind: 'text',
		properties: {
			layout: { type: 'integer' },
			content: { type: 'text', allow_newlines: true }
		}
	},
	heading_2: {
		kind: 'text',
		properties: {
			layout: { type: 'integer' },
			content: { type: 'text', allow_newlines: true }
		}
	},
	heading_3: {
		kind: 'text',
		properties: {
			layout: { type: 'integer' },
			content: { type: 'text', allow_newlines: true }
		}
	},
	story: {
		kind: 'block',
		properties: {
			layout: { type: 'integer' },
			title: { type: 'text', allow_newlines: false },
			description: { type: 'text', allow_newlines: true },
			buttons: { type: 'node_array', node_types: ['button'], default_node_type: 'button' },
			image: { type: 'string' }
		}
	},
	list_item: {
		kind: 'text',
		properties: {
			content: { type: 'text', allow_newlines: true }
		}
	},
	list: {
		kind: 'block',
		properties: {
			layout: { type: 'integer' },
			list_items: {
				type: 'node_array',
				node_types: ['list_item'],
				default_node_type: 'list_item'
			}
		}
	}
});

const doc = {
	document_id: 'page_1',
	nodes: {
		button_1: {
			id: 'button_1',
			type: 'button',
			content: { text: 'Get started', annotations: [] },
			href: 'https://github.com/michael/svedit'
		},
		story_1: {
			id: 'story_1',
			type: 'story',
			layout: 1,
			image:
				'https://images.unsplash.com/photo-1511044568932-338cba0ad803?q=80&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
			title: { text: 'First story', annotations: [] },
			buttons: { nodes: ['button_1'], annotations: [] },
			description: { text: 'First story description.', annotations: [] }
		},
		list_item_1: {
			id: 'list_item_1',
			type: 'list_item',
			content: { text: 'first list item', annotations: [] }
		},
		list_item_2: {
			id: 'list_item_2',
			type: 'list_item',
			content: { text: 'second list item', annotations: [] }
		},
		list_1: {
			id: 'list_1',
			type: 'list',
			layout: 1,
			list_items: { nodes: ['list_item_1', 'list_item_2'], annotations: [] }
		},
		page_1: {
			id: 'page_1',
			type: 'page',
			body: { nodes: ['story_1', 'story_1', 'list_1'], annotations: [] },
			keywords: ['svelte', 'editor', 'rich content'],
			daily_visitors: [10, 20, 30, 100],
			created_at: '2025-05-30T10:39:59.987Z'
		}
	}
};

const session_config = {
	generate_id: nanoid,
	system_components: {},
	node_components: {
		page: Page,
		button: Button,
		paragraph: Paragraph,
		heading_1: Heading1,
		heading_2: Heading2,
		heading_3: Heading3,
		story: Story,
		list: List,
		list_item: ListItem
	},
	node_layouts: {
		paragraph: 1,
		heading_1: 1,
		heading_2: 1,
		heading_3: 1,
		story: 3,
		list: 5,
		list_item: 1
	},
	inserters: {
		button: function (tr, content = { text: '', annotations: [] }) {
			const new_button = {
				id: nanoid(),
				type: 'button',
				content,
				href: 'https://editable.website'
			};
			tr.create(new_button);
			tr.insert_nodes([new_button.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		paragraph: function (tr, content) {
			const text_content = content || { text: '', annotations: [] };
			const new_paragraph = {
				id: nanoid(),
				type: 'paragraph',
				layout: 1,
				content: text_content
			};
			tr.create(new_paragraph);
			tr.insert_nodes([new_paragraph.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		heading_1: function (tr, content) {
			const text_content = content || { text: '', annotations: [] };
			const new_heading_1 = {
				id: nanoid(),
				type: 'heading_1',
				layout: 1,
				content: text_content
			};
			tr.create(new_heading_1);
			tr.insert_nodes([new_heading_1.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		heading_2: function (tr, content) {
			const text_content = content || { text: '', annotations: [] };
			const new_heading_2 = {
				id: nanoid(),
				type: 'heading_2',
				layout: 1,
				content: text_content
			};
			tr.create(new_heading_2);
			tr.insert_nodes([new_heading_2.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		heading_3: function (tr, content) {
			const text_content = content || { text: '', annotations: [] };
			const new_heading_3 = {
				id: nanoid(),
				type: 'heading_3',
				layout: 1,
				content: text_content
			};
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
				type: 'button',
				content: { text: '', annotations: [] },
				href: 'https://editable.website'
			};
			tr.create(new_button);
			const new_story = {
				id: nanoid(),
				type: 'story',
				layout: 1,
				image: '',
				title: { text: '', annotations: [] },
				description: { text: '', annotations: [] },
				buttons: { nodes: [new_button.id], annotations: [] }
			};
			tr.create(new_story);
			tr.insert_nodes([new_story.id]);
		},
		list: function (tr) {
			const new_list_item = {
				id: nanoid(),
				type: 'list_item',
				content: { text: '', annotations: [] }
			};
			tr.create(new_list_item);
			const new_list = {
				id: nanoid(),
				type: 'list',
				list_items: { nodes: [new_list_item.id], annotations: [] },
				layout: 3
			};
			tr.create(new_list);
			tr.insert_nodes([new_list.id]);
		},
		list_item: function (tr, content) {
			const item_content = content || { text: '', annotations: [] };
			const new_list_item = {
				id: nanoid(),
				type: 'list_item',
				content: item_content
			};
			tr.create(new_list_item);
			tr.insert_nodes([new_list_item.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		}
	}
};

export default function create_test_session() {
	const session = new Session(document_schema, doc, session_config);
	return session;
}
