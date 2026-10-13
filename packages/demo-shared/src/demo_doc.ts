import type { Document } from '@svedit/core';

/** The framework-specific bits of the demo document's copy and assets. */
export type DemoFramework = {
	/** Framework name as it appears in the copy, e.g. 'React'. */
	name: 'Svelte' | 'React' | 'Vue';
	/** Name with major version for the "Made for ..." story, e.g. 'React 19'. */
	version: string;
	/** Framework homepage linked from the "Made for ..." story. */
	site_url: string;
	/** File name (under images/) of the framework logo. */
	logo_image: string;
	/** File name (under images/) of the "<Framework>-native" grid illustration. */
	framework_image: string;
	/** Name of the editor component file mentioned in the copy, e.g. 'Svedit.tsx'. */
	component_file: string;
};

const story_5_prefix = 'Integrate with your ';
const story_5_middle = ' application. Use it as a library or copy and paste ';
const story_5_suffix = ' to build your custom rich content editor.';

/**
 * Build the demo document for one framework. `base` is the prefix for static
 * assets: the app's base URL (/react/ or /vue/ in the assembled site, / in a
 * standalone build).
 */
export function create_demo_doc(framework: DemoFramework, base: string): Document {
	// The "Made for ..." story links the framework name and emphasizes the
	// component file name, so the mark offsets follow from the segment lengths.
	const story_5_description =
		story_5_prefix + framework.name + story_5_middle + framework.component_file + story_5_suffix;
	const link_2_start = story_5_prefix.length;
	const link_2_end = link_2_start + framework.name.length;
	const emphasis_1_start = link_2_end + story_5_middle.length;
	const emphasis_1_end = emphasis_1_start + framework.component_file.length;

	return {
		document_id: 'page_1',
		nodes: {
			hero_1: {
				id: 'hero_1',
				type: 'hero',
				title: {
					content: 'Svedit',
					marks: [],
					annotations: []
				},
				description: {
					content: `Full canvas editing for ${framework.name}`,
					marks: [],
					annotations: []
				},
				image: ''
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
				layout: 'image-left',
				image: `${base}images/editable.svg`,
				title: {
					content: 'Structured, full-canvas content editing',
					marks: [],
					annotations: []
				},
				description: {
					content: `Model your content in JSON, render it with ${framework.name} components, and edit it directly in the layout. You only have to follow a couple of rules to make this work.`,
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
				layout: 'image-right',
				image: `${base}images/lightweight.svg`,
				title: {
					content: 'Tiny footprint',
					marks: [],
					annotations: []
				},
				description: {
					content:
						"The reference implementation uses only few thousand lines of code. That means you'll be able to serve editable websites, removing the need for a separate Content Management System.",
					marks: [
						{
							start_offset: 102,
							end_offset: 119,
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
				image: `${base}images/${framework.framework_image}`,
				title: {
					content: `${framework.name}-native`,
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
				image: `${base}images/annotations.svg`,
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
				image: `${base}images/graphmodel.svg`,
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
				image: `${base}images/dom-synced.svg`,
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
				image: `${base}images/cjk.svg`,
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
				image: `${base}images/timetravel.svg`,
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
				layout: 'image-left',
				image: `${base}images/nested-blocks-illustration.svg`,
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
			ragwHxzMXNwbPMYNAJwjcnB: {
				id: 'ragwHxzMXNwbPMYNAJwjcnB',
				type: 'code'
			},
			WmymYMNaMsxFXFCaJrtyGZh: {
				id: 'WmymYMNaMsxFXFCaJrtyGZh',
				type: 'code'
			},
			story_4: {
				id: 'story_4',
				type: 'story',
				layout: 'image-right',
				image: `${base}images/node-carets.svg`,
				title: {
					content: 'Node carets',
					marks: [],
					annotations: []
				},
				description: {
					content:
						'They work just like text carets, but instead of a character position in a string they address a node position in a node_array.\n\nTry it by selecting one of the gaps between the nodes. Then press ↵ to insert a new node or ⌫ to delete the node before the caret.',
					marks: [
						{
							start_offset: 194,
							end_offset: 195,
							node_id: 'ragwHxzMXNwbPMYNAJwjcnB'
						},
						{
							start_offset: 220,
							end_offset: 221,
							node_id: 'WmymYMNaMsxFXFCaJrtyGZh'
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
			link_2: {
				id: 'link_2',
				type: 'link',
				href: framework.site_url
			},
			emphasis_1: {
				id: 'emphasis_1',
				type: 'emphasis'
			},
			story_5: {
				id: 'story_5',
				type: 'story',
				layout: 'image-left',
				image: `${base}images/${framework.logo_image}`,
				title: {
					content: `Made for ${framework.version}`,
					marks: [],
					annotations: []
				},
				description: {
					content: story_5_description,
					marks: [
						{
							start_offset: link_2_start,
							end_offset: link_2_end,
							node_id: 'link_2'
						},
						{
							start_offset: emphasis_1_start,
							end_offset: emphasis_1_end,
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
				layout: 'image-right',
				image: `${base}images/extendable.svg`,
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
			zvjHhSAVYZBxqUBdKkmKFMj: {
				id: 'zvjHhSAVYZBxqUBdKkmKFMj',
				type: 'code'
			},
			list_item_1: {
				id: 'list_item_1',
				type: 'list_item',
				content: {
					content:
						"It's a bit hard to select whole lists or image grids with the mouse still. We're looking to improve this. However, by pressing the Esc key  several times you can reach parent nodes easily.",
					marks: [
						{
							start_offset: 131,
							end_offset: 134,
							node_id: 'zvjHhSAVYZBxqUBdKkmKFMj'
						}
					],
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
						'Mobile support is still experimental. Svedit works on latest iOS and Android and ships a mobile-optimized user experience.',
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
				layout: 'disc'
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
				layout: 'image-left',
				image: `${base}images/github.svg`,
				title: {
					content: 'Find us on GitHub',
					marks: [],
					annotations: []
				},
				description: {
					content:
						'Thank you for all the stars you left us on GitHub. Svedit is made by Michael Aufreiter and Johannes Mutter and is licensed under the MIT License.',
					marks: [
						{
							start_offset: 69,
							end_offset: 86,
							node_id: 'link_4'
						},
						{
							start_offset: 91,
							end_offset: 106,
							node_id: 'link_5'
						},
						{
							start_offset: 43,
							end_offset: 49,
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
				keywords: [framework.name.toLowerCase(), 'editor', 'rich content'],
				daily_visitors: [10, 20, 30, 100],
				created_at: '2025-05-30T10:39:59.987Z'
			}
		}
	};
}
