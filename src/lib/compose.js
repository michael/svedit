/**
 * Opt-in composition of packages into a flat schema + config.
 *
 * A package is a plain object that groups everything one concern needs
 * (schema entries including sub-node types, components, inserters,
 * exporters, commands, keymap contributions). `compose` merges packages
 * into exactly the flat `{ schema, config }` shape a Session expects — after
 * composition there is no runtime indirection, and the flat style remains
 * fully supported.
 *
 * Rules:
 * - Every package must have a unique `name`; names are used in diagnostics.
 * - Packages define node types; only the app wires containers
 *   (`node_types`, `default_node_type`, `mark_types`, `annotation_types`).
 * - Known Svedit registry keys and custom app registry keys merge
 *   key-by-key; duplicate keys across packages throw.
 * - Unknown scalar/function package keys throw, because app-level scalar
 *   config belongs in the second `compose(..., app_config)` argument.
 * - `commands` factories are combined into a single
 *   `create_commands_and_keymap`; `keymap` entries reference commands by
 *   name and concatenate when multiple packages bind the same key.
 */

/**
 * @import { Package } from './types'
 */

import { define_keymap } from './KeyMapper.svelte.js';

/** Package keys that are not plain config registries */
const SPECIAL_KEYS = ['name', 'schema', 'commands', 'keymap'];

/**
 * @param {Package} pkg
 * @param {number} index
 * @returns {string} Package name for error messages
 */
function package_name(pkg, index) {
	if (typeof pkg.name !== 'string' || pkg.name.length === 0) {
		throw new Error(`compose: package #${index + 1} must have a non-empty name.`);
	}
	return pkg.name;
}

/**
 * Merge `source` into `target` key-by-key, throwing on duplicate keys.
 *
 * @param {Record<string, any>} target
 * @param {Record<string, any>} source
 * @param {Record<string, string>} owners - Maps merged keys to their package name
 * @param {string} owner - Name of the package being merged
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

function is_plain_object(value) {
	return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Compose packages and app config into a flat schema and config.
 *
 * @param {Package[]} packages - Packages, merged in order
 * @param {Record<string, any>} [app_config] - App-level config (generate_id,
 *   system_components, handlers, ...). Object-valued keys participate in the
 *   collision-checked merge; other values are set directly.
 * @returns {{ schema: Record<string, any>, config: Record<string, any> }}
 */
export function compose(packages, app_config = {}) {
	/** @type {Record<string, any>} */
	const schema = {};
	/** @type {Record<string, any>} */
	const config = {};

	// Track which package contributed each key, per registry
	/** @type {Record<string, Record<string, string>>} */
	const owners = { schema: {} };

	/** @type {Array<{ owner: string, factory: (context: any) => Record<string, any> }>} */
	const command_factories = [];
	/** @type {Record<string, string[]>} */
	const keymap_names = {};
	const package_names = new Set();

	for (const [index, pkg] of packages.entries()) {
		const owner = package_name(pkg, index);
		if (package_names.has(owner)) {
			throw new Error(`compose: duplicate package name '${owner}'.`);
		}
		package_names.add(owner);

		for (const key of Object.keys(pkg)) {
			if (SPECIAL_KEYS.includes(key)) continue;
			const value = pkg[key];
			if (!is_plain_object(value)) {
				throw new Error(
					`compose: unknown package key '${key}' in ${owner}. Custom package keys must be plain object registries.`
				);
			}
		}

		if (pkg.schema) {
			merge_registry(schema, pkg.schema, owners.schema, owner, 'schema');
		}

		if (pkg.commands) {
			command_factories.push({ owner, factory: pkg.commands });
		}

		if (pkg.keymap) {
			for (const [key_combo, command_names] of Object.entries(pkg.keymap)) {
				// Same key from multiple packages concatenates in order,
				// matching the existing fallback semantics of keymap arrays.
				keymap_names[key_combo] = [...(keymap_names[key_combo] ?? []), ...command_names];
			}
		}

		for (const [key, value] of Object.entries(pkg)) {
			if (SPECIAL_KEYS.includes(key)) continue;
			config[key] ??= {};
			owners[key] ??= {};
			merge_registry(config[key], value, owners[key], owner, `config.${key}`);
		}
	}

	for (const [key, value] of Object.entries(app_config)) {
		if (is_plain_object(value)) {
			config[key] ??= {};
			owners[key] ??= {};
			merge_registry(config[key], value, owners[key], 'app config', `config.${key}`);
		} else {
			config[key] = value;
		}
	}

	if (command_factories.length > 0 || Object.keys(keymap_names).length > 0) {
		if (config.create_commands_and_keymap) {
			throw new Error(
				'compose: pass commands/keymap through packages OR provide create_commands_and_keymap, not both.'
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
