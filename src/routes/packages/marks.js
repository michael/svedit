import { ToggleMarkCommand } from 'svedit';
import { ToggleLinkCommand } from '../commands.svelte.js';

import Strong from '../components/Strong.svelte';
import Emphasis from '../components/Emphasis.svelte';
import Highlight from '../components/Highlight.svelte';
import Link from '../components/Link.svelte';
import Section from '../components/Section.svelte';

// Mark bundles other packages reference from their text properties
export const ALL_MARKS = ['strong', 'emphasis', 'highlight', 'link'];
export const TITLE_MARKS = ['emphasis', 'highlight'];

export default {
	name: 'marks',
	schema: {
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
		link: {
			kind: 'mark',
			properties: {
				href: { type: 'string' }
			}
		},
		section: {
			kind: 'mark',
			properties: {}
		}
	},
	node_components: {
		strong: Strong,
		emphasis: Emphasis,
		highlight: Highlight,
		link: Link,
		section: Section
	},
	commands: (context) => ({
		toggle_strong: new ToggleMarkCommand('strong', context),
		toggle_emphasis: new ToggleMarkCommand('emphasis', context),
		toggle_highlight: new ToggleMarkCommand('highlight', context),
		toggle_link: new ToggleLinkCommand(context),
		toggle_section: new ToggleMarkCommand('section', context)
	}),
	keymap: {
		'meta+b,ctrl+b': ['toggle_strong'],
		'meta+i,ctrl+i': ['toggle_emphasis'],
		'meta+u,ctrl+u': ['toggle_highlight'],
		'meta+k,ctrl+k': ['toggle_link'],
		'meta+shift+s,ctrl+shift+s': ['toggle_section']
	}
};
