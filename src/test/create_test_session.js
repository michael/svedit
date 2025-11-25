import Session from '../lib/Session.svelte.js';
import { define_document_schema } from '../lib/doc_utils.js';
import nanoid from '../routes/nanoid.js';

// System components
import Overlays from '../routes/components/Overlays.svelte';
import NodeCursorTrap from '../routes/components/NodeCursorTrap.svelte';

// Node components
import Page from '../routes/components/Page.svelte';
import Story from '../routes/components/Story.svelte';
import Button from '../routes/components/Button.svelte';
import Text from '../routes/components/Text.svelte';
import List from '../routes/components/List.svelte';
import ListItem from '../routes/components/ListItem.svelte';

const document_schema = define_document_schema({
	page: {
		kind: 'document',
		properties: {
			body: {
				type: 'node_array',
				node_types: ['text', 'story', 'list'],
				default_node_type: 'text'
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
		kind: 'block',
		properties: {
			label: { type: 'annotated_text', allow_newlines: false },
			href: { type: 'string' }
		}
	},
	text: {
		kind: 'text',
		properties: {
			layout: { type: 'integer' },
			content: { type: 'annotated_text', allow_newlines: true }
		}
	},
	story: {
		kind: 'block',
		properties: {
			layout: { type: 'integer' },
			title: { type: 'annotated_text', allow_newlines: false },
			description: { type: 'annotated_text', allow_newlines: true },
			buttons: { type: 'node_array', node_types: ['button'], default_node_type: 'button' },
			image: { type: 'string' }
		}
	},
	list_item: {
		kind: 'text',
		properties: {
			content: { type: 'annotated_text', allow_newlines: true }
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

const serialized_doc = {
	document_id: 'page_1',
	nodes: {
		button_1: {
			id: 'button_1',
			type: 'button',
			label: { text: 'Get started', annotations: [] },
			href: 'https://github.com/michael/svedit'
		},
		story_1: {
			id: 'story_1',
			type: 'story',
			layout: 1,
			image:
				'https://images.unsplash.com/photo-1511044568932-338cba0ad803?q=80&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
			title: { text: 'First story', annotations: [] },
			buttons: ['button_1'],
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
			list_items: ['list_item_1', 'list_item_2']
		},
		page_1: {
			id: 'page_1',
			type: 'page',
			body: ['story_1', 'story_1', 'list_1'],
			keywords: ['svelte', 'editor', 'rich content'],
			daily_visitors: [10, 20, 30, 100],
			created_at: '2025-05-30T10:39:59.987Z'
		}
	}
};

const document_config = {
	generate_id: nanoid,
	system_components: {
		NodeCursorTrap,
		Overlays
	},
	node_components: {
		Page,
		Button,
		Text,
		Story,
		List,
		ListItem
	},
	node_layouts: {
		text: 4,
		story: 3,
		list: 5,
		list_item: 1
	},
	inserters: {
		button: function (tr) {
			const new_button = {
				id: nanoid(),
				type: 'button',
				label: { text: '', annotations: [] },
				href: 'https://editable.website'
			};
			tr.create(new_button);
			tr.insert_nodes([new_button.id]);
			tr.set_selection({
				type: 'node',
				path: [...tr.doc.selection.path],
				anchor_offset: tr.doc.selection.focus_offset,
				focus_offset: tr.doc.selection.focus_offset
			});
		},
		text: function (tr, content) {
			const text_content = content || { text: '', annotations: [] };
			const new_text = {
				id: nanoid(),
				type: 'text',
				layout: 1,
				content: text_content
			};
			tr.create(new_text);
			tr.insert_nodes([new_text.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		story: function (tr) {
			const new_button = {
				id: nanoid(),
				type: 'button',
				label: { text: '', annotations: [] },
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
				buttons: [new_button.id]
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
				list_items: [new_list_item.id],
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
				path: [...tr.doc.selection.path, tr.doc.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		}
	}
};

export default function create_test_session() {
	const session = new Session(document_schema, serialized_doc, { config: document_config });
	return session;
}
