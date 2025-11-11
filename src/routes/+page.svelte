<script>
	import { setContext } from 'svelte';
	import { Svedit, KeyMapper, define_keymap } from 'svedit';
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

	// Create KeyMapper and provide via context
	const key_mapper = new KeyMapper();
	setContext('key_mapper', key_mapper);

	// Push app-level scope (base layer)
	const app_key_map = define_keymap({
		'meta+e,ctrl+e': [app_commands.edit_document, app_commands.save_document]
	});
	key_mapper.push_scope(app_key_map);
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
