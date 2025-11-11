<script>
	import { Svedit } from 'svedit';
	import Toolbar from './components/Toolbar.svelte';
	import create_demo_doc from './create_demo_doc.js';

	const doc = create_demo_doc();

	let app_el;
	let svedit_ref;
	let editable = $state(true);

	function focus_canvas() {
		if (svedit_ref) {
			svedit_ref.focus_canvas();
		}
	}

	export { focus_canvas };

	class AppCommand {
		disabled = $derived(!this.is_enabled());
		constructor(context) {
			this.context = context;
		}

		is_enabled() {
			return true;
		}

		execute() {
			throw new Error('Not implemented');
		}
	}

	class EditCommand extends AppCommand {
		is_enabled() {
			// disabled if edit mode is already on
			return !this.context.editable;
		}

		execute() {
			this.context.editable = true;
		}
	}

	class SaveCommand extends AppCommand {

		is_enabled() {
			// Saving is only possible while edit mode is on.
			return this.context.editable;
		}

		execute() {
			this.context.editable = false;
		}
	}


	const app_command_context = {
		get editable() {
			return editable;
		},
		set editable(value) {
			editable = value;
		},
		get doc() {
			return doc;
		},
		get app_el() {
			return app_el;
		}
	};

	const app_commands = {
		edit_document: new EditCommand(app_command_context),
		save_document: new SaveCommand(app_command_context)
	};

	const MODIFIER_KEYS = ['meta', 'ctrl', 'alt', 'shift'];
	const MODIFIER_EVENT_KEYS = {
		meta: 'metaKey',
		ctrl: 'ctrlKey',
		alt: 'altKey',
		shift: 'shiftKey'
	};

	/**
	 * Validates and defines a keymap.
	 * Throws an error if any key combo is invalid.
	 * Valid formats: 'meta+e,ctrl+e' or 'meta+shift+a'
	 * Invalid: 'meta+e+a' (only one non-modifier key allowed)
	 */
	function define_keymap(keymap) {
		for (const [key_combo] of Object.entries(keymap)) {
			const alternatives = key_combo.split(',');

			for (const alternative of alternatives) {
				const parts = alternative.trim().toLowerCase().split('+');
				// const modifiers = parts.filter(part => MODIFIER_KEYS.includes(part));
				const non_modifiers = parts.filter(part => !MODIFIER_KEYS.includes(part));

				if (non_modifiers.length !== 1) {
					throw new Error(
						`Invalid key combo: "${alternative}". Must have exactly one non-modifier key. Found: ${non_modifiers.length}`
					);
				}

				if (non_modifiers[0].length !== 1) {
					throw new Error(
						`Invalid key combo: "${alternative}". Non-modifier key must be a single character. Got: "${non_modifiers[0]}"`
					);
				}
			}
		}
		return keymap;
	}

	/**
	 * Matches a keyboard event against a key combo string.
	 * Example: 'meta+e,ctrl+e' matches either (metaKey && key==='e') OR (ctrlKey && key==='e')
	 */
	function matches_key_combo(key_combo, event) {
		const alternatives = key_combo.split(',');

		return alternatives.some(alternative => {
			const parts = alternative.trim().toLowerCase().split('+');
			const modifiers = parts.filter(part => MODIFIER_KEYS.includes(part));
			const non_modifier = parts.find(part => !MODIFIER_KEYS.includes(part));

			// Check if all specified modifiers are pressed
			const modifiers_match = modifiers.every(mod => event[MODIFIER_EVENT_KEYS[mod]]);

			// Check if no unspecified modifiers are pressed
			const no_extra_modifiers = MODIFIER_KEYS.every(mod => {
				if (modifiers.includes(mod)) return true; // This modifier is expected
				return !event[MODIFIER_EVENT_KEYS[mod]]; // This modifier should NOT be pressed
			});

			// Check if the key matches
			const key_matches = event.key.toLowerCase() === non_modifier;
			return modifiers_match && no_extra_modifiers && key_matches;
		});
	}

	function handle_key_map(key_map, event) {
		for (const [key_combo, commands] of Object.entries(key_map)) {
			if (matches_key_combo(key_combo, event)) {
				// Find the first enabled command and execute it
				const enabled_command = commands.find(cmd => cmd.is_enabled());
				if (enabled_command) {
					event.preventDefault();
					enabled_command.execute();
					return true;
				}
			}
		}
		return false;
	}

	const app_key_map = define_keymap({
		'meta+e,ctrl+e': [app_commands.edit_document, app_commands.save_document],
	});

	function handle_app_keydown(event) {
		console.log('app-keydown', event);
		handle_key_map(app_key_map, event);
	}
</script>

<svelte:head>
	<title>Svedit - A tiny library for building editable websites in Svelte</title>
	<script async defer src="https://buttons.github.io/buttons.js"></script>
</svelte:head>

<div class="demo-wrapper" bind:this={app_el}>
	<Toolbar {doc} {focus_canvas} bind:editable />
	<Svedit {doc} bind:editable bind:this={svedit_ref} path={[doc.document_id]} />

	{#if editable}
		<div class="flex-column gap-y-2 my-10 w-full max-w-screen-lg mx-auto">
			<p>Selection:</p>
			<pre class="debug-info p-4">{JSON.stringify(doc.selection || {}, null, '  ')}</pre>
			<p>Nodes:</p>
			<pre class="debug-info p-4">{JSON.stringify(doc.nodes, null, '  ')}</pre>
		</div>
	{/if}
</div>

<svelte:window onkeydown={handle_app_keydown} />

<style>
	.debug-info {
		text-wrap: wrap;
		height: 12lh;
		overflow-y: auto;
		color: white;
		background: var(--primary-fill-color);
		font-size: 12px;
	}
</style>
