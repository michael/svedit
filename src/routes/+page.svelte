<script>
	import { setContext } from 'svelte';
	import { Svedit, Command, KeyMapper, define_keymap } from 'svedit';
	import Toolbar from './components/Toolbar.svelte';
	import create_demo_session from './create_demo_session.js';

	const session = create_demo_session();
	let app_el;
	let svedit_ref;
	let editable = $state(true);

	function focus_canvas() {
		if (svedit_ref) {
			svedit_ref.focus_canvas();
		}
	}

	class EditCommand extends Command {
		is_enabled() {
			// disabled if edit mode is already on
			return !this.context.editable;
		}

		execute() {
			this.context.editable = true;
		}
	}

	class SaveCommand extends Command {
		is_enabled() {
			// Saving is only possible while edit mode is on.
			return this.context.editable;
		}

		async execute() {
			// Example: async commands are supported
			// await update_document(this.context.session);
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
		get session() {
			return session;
		},
		get app_el() {
			return app_el;
		}
	};

	const app_commands = {
		edit_document: new EditCommand(app_command_context),
		save_document: new SaveCommand(app_command_context)
	};

	// Create KeyMapper and provide via context
	const key_mapper = new KeyMapper();
	setContext('key_mapper', key_mapper);

	// Push app-level keymap scope
	const app_key_map = define_keymap({
		'meta+e,ctrl+e': [app_commands.edit_document],
		'meta+s,ctrl+s': [app_commands.save_document]
	});
	key_mapper.push_scope(app_key_map);
</script>

<svelte:head>
	<title>Svedit - A tiny library for building editable websites in Svelte</title>
	<script async defer src="https://buttons.github.io/buttons.js"></script>
</svelte:head>

<div class="demo-wrapper" bind:this={app_el}>
	<Toolbar {session} {focus_canvas} bind:editable />
	<Svedit {session} bind:editable bind:this={svedit_ref} path={[session.doc.document_id]} />

	{#if editable}
		<div class="flex-column gap-y-2 my-10 w-full max-w-screen-lg mx-auto">
			<p>Selection:</p>
			<pre class="debug-info p-4">{JSON.stringify(session.selection || {}, null, '  ')}</pre>
			<p>Nodes:</p>
			<pre class="debug-info p-4">{JSON.stringify(session.doc, null, '  ')}</pre>
		</div>
	{/if}
</div>

<svelte:window onkeydown={key_mapper.handle_keydown.bind(key_mapper)} />

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
