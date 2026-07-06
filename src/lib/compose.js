/**
 * Opt-in composition of per-feature definitions into a flat schema + config.
 *
 * A feature definition is a plain object that groups everything one feature
 * needs (schema entries including sub-node types, components, inserters,
 * exporters, commands, keymap contributions). `compose` merges definitions
 * into exactly the flat `{ schema, config }` shape a Session expects — after
 * composition there is no runtime indirection, and the flat style remains
 * fully supported.
 *
 * Rules:
 * - Definitions define node types; only the app wires containers
 *   (`node_types`, `default_node_type`, `mark_types`, `annotation_types`).
 * - Object-valued config keys (node_components, inserters, html_exporters,
 *   and any app-specific registry like node_layouts) merge key-by-key;
 *   duplicate keys across definitions throw.
 * - `commands` factories are combined into a single
 *   `create_commands_and_keymap`; `keymap` entries reference commands by
 *   name and concatenate when multiple definitions bind the same key.
 */

/**
 * @import { FeatureDefinition } from './types'
 */

import { define_keymap } from './KeyMapper.svelte.js';

/** Definition keys that are not plain config registries */
const SPECIAL_KEYS = ['name', 'schema', 'commands', 'keymap'];

/**
 * @param {FeatureDefinition} definition
 * @param {number} index
 * @returns {string} Definition name for error messages
 */
function definition_name(definition, index) {
	return definition.name ?? `definition #${index + 1}`;
}

/**
 * Merge `source` into `target` key-by-key, throwing on duplicate keys.
 *
 * @param {Record<string, any>} target
 * @param {Record<string, any>} source
 * @param {Record<string, string>} owners - Maps merged keys to their definition name
 * @param {string} owner - Name of the definition being merged
 * @param {string} registry - Registry name for error messages (e.g. 'schema')
 */
function merge_registry(target, source, owners, owner, registry) {
	for (const [key, value] of Object.entries(source)) {
		if (key in target) {
			throw new Error(
				`compose: ${registry} key '${key}' from ${owner} conflicts with ${owners[key]}.`
			);
		}
		target[key] = value;
		owners[key] = owner;
	}
}

/**
 * Compose feature definitions and app config into a flat schema and config.
 *
 * @param {FeatureDefinition[]} definitions - Feature definitions, merged in order
 * @param {Record<string, any>} [app_config] - App-level config (generate_id,
 *   system_components, handlers, ...). Object-valued keys participate in the
 *   collision-checked merge; other values are set directly.
 * @returns {{ schema: Record<string, any>, config: Record<string, any> }}
 */
export function compose(definitions, app_config = {}) {
	/** @type {Record<string, any>} */
	const schema = {};
	/** @type {Record<string, any>} */
	const config = {};

	// Track which definition contributed each key, per registry
	/** @type {Record<string, Record<string, string>>} */
	const owners = { schema: {} };

	/** @type {Array<{ owner: string, factory: (context: any) => Record<string, any> }>} */
	const command_factories = [];
	/** @type {Record<string, string[]>} */
	const keymap_names = {};

	const all_entries = [
		...definitions.map((definition, index) => ({
			definition,
			owner: definition_name(definition, index)
		})),
		{ definition: app_config, owner: 'app config' }
	];

	for (const { definition, owner } of all_entries) {
		if (definition.schema) {
			merge_registry(schema, definition.schema, owners.schema, owner, 'schema');
		}

		if (definition.commands) {
			command_factories.push({ owner, factory: definition.commands });
		}

		if (definition.keymap) {
			for (const [key_combo, command_names] of Object.entries(definition.keymap)) {
				// Same key from multiple definitions concatenates in order,
				// matching the existing fallback semantics of keymap arrays.
				keymap_names[key_combo] = [...(keymap_names[key_combo] ?? []), ...command_names];
			}
		}

		for (const [key, value] of Object.entries(definition)) {
			if (SPECIAL_KEYS.includes(key)) continue;

			if (value && typeof value === 'object' && !Array.isArray(value)) {
				// Registry-style config (node_components, inserters,
				// html_exporters, node_layouts, ...): merge key-by-key.
				config[key] ??= {};
				owners[key] ??= {};
				merge_registry(config[key], value, owners[key], owner, `config.${key}`);
			} else {
				// Scalar/function/array config (generate_id, view_classes,
				// handle_media_paste, ...): app config wins, definitions may
				// not compete for the same key.
				if (key in config && owner !== 'app config') {
					throw new Error(`compose: config key '${key}' from ${owner} is already set.`);
				}
				config[key] = value;
			}
		}
	}

	if (command_factories.length > 0 || Object.keys(keymap_names).length > 0) {
		if (config.create_commands_and_keymap) {
			throw new Error(
				'compose: pass commands/keymap through definitions OR provide create_commands_and_keymap, not both.'
			);
		}
		config.create_commands_and_keymap = (context) => {
			/** @type {Record<string, any>} */
			const commands = {};
			/** @type {Record<string, string>} */
			const command_owners = {};
			for (const { owner, factory } of command_factories) {
				merge_registry(commands, factory(context), command_owners, owner, 'commands');
			}

			/** @type {Record<string, any[]>} */
			const keymap = {};
			for (const [key_combo, command_names] of Object.entries(keymap_names)) {
				keymap[key_combo] = command_names.map((command_name) => {
					if (!commands[command_name]) {
						throw new Error(
							`compose: keymap '${key_combo}' references unknown command '${command_name}'.`
						);
					}
					return commands[command_name];
				});
			}

			return { commands, keymap: define_keymap(keymap) };
		};
	}

	return { schema, config };
}
