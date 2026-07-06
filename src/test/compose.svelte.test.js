import { describe, expect, it } from 'vitest';
import { compose } from '../lib/compose.js';
import Session from '../lib/Session.svelte.js';
import Command from '../lib/Command.svelte.js';

import Page from '../packages/page/Page.svelte';
import Paragraph from '../packages/text_blocks/Paragraph.svelte';

class NoopCommand extends Command {
	execute() {}
}

const page_package = {
	name: 'page',
	schema: {
		page: {
			kind: 'document',
			properties: {
				body: {
					type: 'node_array',
					node_types: ['paragraph'],
					default_node_type: 'paragraph'
				}
			}
		}
	},
	node_components: { page: Page }
};

const paragraph_package = {
	name: 'paragraph',
	schema: {
		paragraph: {
			kind: 'text',
			properties: {
				content: { type: 'text', allow_newlines: true }
			}
		}
	},
	node_components: { paragraph: Paragraph },
	node_layouts: { paragraph: 1 }
};

describe('compose', () => {
	it('merges schema and object-valued config registries', () => {
		const { schema, config } = compose([page_package, paragraph_package], {
			generate_id: () => 'id_1',
			view_classes: false
		});

		expect(Object.keys(schema)).toEqual(['page', 'paragraph']);
		expect(config.node_components.page).toBe(Page);
		expect(config.node_components.paragraph).toBe(Paragraph);
		// Unknown app-specific registries merge too
		expect(config.node_layouts).toEqual({ paragraph: 1 });
		// App-level scalars are set directly
		expect(config.generate_id()).toBe('id_1');
		expect(config.view_classes).toBe(false);
	});

	it('throws on duplicate schema keys across packages', () => {
		expect(() =>
			compose([paragraph_package, { ...paragraph_package, name: 'other_paragraph' }])
		).toThrow(
			"schema key 'paragraph' from other_paragraph conflicts with paragraph"
		);
	});

	it('throws on duplicate registry keys and names the packages', () => {
		const other = {
			name: 'other',
			node_components: { paragraph: Page }
		};
		expect(() => compose([paragraph_package, other])).toThrow(
			"config.node_components key 'paragraph' from other conflicts with paragraph"
		);
	});

	it('throws when a package has no name', () => {
		expect(() => compose([/** @type {any} */ ({ schema: {} })])).toThrow(
			'package #1 must have a non-empty name'
		);
	});

	it('throws when two packages use the same name', () => {
		expect(() => compose([{ name: 'a' }, { name: 'a' }])).toThrow(
			"duplicate package name 'a'"
		);
	});

	it('throws on unknown package keys', () => {
		expect(() => compose([/** @type {any} */ ({ name: 'a', view_classes: true })])).toThrow(
			"unknown package key 'view_classes' in a"
		);
	});

	it('lets app config provide scalar keys', () => {
		const { config } = compose([{ name: 'a' }], { view_classes: false });
		expect(config.view_classes).toBe(false);
	});

	it('builds create_commands_and_keymap from command factories and name-based keymaps', () => {
		const package_a = {
			name: 'a',
			commands: (context) => ({ command_a: new NoopCommand(context) }),
			keymap: { 'meta+j,ctrl+j': ['command_a'], enter: ['command_a'] }
		};
		const package_b = {
			name: 'b',
			commands: (context) => ({ command_b: new NoopCommand(context) }),
			// Same key from multiple packages concatenates in order
			keymap: { enter: ['command_b'] }
		};

		const { config } = compose([package_a, package_b]);
		const { commands, keymap } = config.create_commands_and_keymap({ session: null });

		expect(Object.keys(commands)).toEqual(['command_a', 'command_b']);
		expect(keymap['meta+j,ctrl+j']).toEqual([commands.command_a]);
		expect(keymap['enter']).toEqual([commands.command_a, commands.command_b]);
	});

	it('throws on duplicate command names across packages', () => {
		const a = { name: 'a', commands: (context) => ({ go: new NoopCommand(context) }) };
		const b = { name: 'b', commands: (context) => ({ go: new NoopCommand(context) }) };
		const { config } = compose([a, b]);
		expect(() => config.create_commands_and_keymap({})).toThrow(
			"commands key 'go' from b conflicts with a"
		);
	});

	it('throws when a keymap references an unknown command name', () => {
		const a = { name: 'a', keymap: { enter: ['missing_command'] } };
		const { config } = compose([a]);
		expect(() => config.create_commands_and_keymap({})).toThrow(
			"keymap 'enter' references unknown command 'missing_command'"
		);
	});

	it('rejects mixing package commands with a custom create_commands_and_keymap', () => {
		const a = { name: 'a', commands: (context) => ({ go: new NoopCommand(context) }) };
		expect(() => compose([a], { create_commands_and_keymap: () => ({}) })).toThrow(
			'not both'
		);
	});

	it('produces a config a Session can be constructed from', () => {
		const { schema, config } = compose([page_package, paragraph_package], {
			generate_id: () => `id_${Math.random().toString(36).slice(2)}`
		});

		const doc = {
			document_id: 'page_1',
			nodes: {
				paragraph_1: {
					id: 'paragraph_1',
					type: 'paragraph',
					content: { content: 'Hello', marks: [], annotations: [] }
				},
				page_1: {
					id: 'page_1',
					type: 'page',
					body: { nodes: ['paragraph_1'], marks: [], annotations: [] }
				}
			}
		};

		const session = new Session(schema, doc, config);
		expect(session.get('paragraph_1').content.content).toBe('Hello');
	});
});
