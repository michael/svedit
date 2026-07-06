// The demo document: a plain JS object with a document_id and a flat map of
// nodes. See the "Document" section in the README for the format.
export default {
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
