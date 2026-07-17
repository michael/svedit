<script lang="ts">
	import { setContext } from 'svelte';
	import { Svedit, Command, KeyMapper, define_keymap } from 'svedit';
	import Toolbar from './components/Toolbar.svelte';
	import create_demo_session, { document_schema } from './create_demo_session.js';

	const session = create_demo_session();
	let app_el: HTMLElement | undefined;
	let svedit_ref: Svedit<typeof document_schema> | undefined;
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
			console.log('Document saved', session.to_json());
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
</svelte:head>

<div class="demo-wrapper" bind:this={app_el}>
	<Toolbar {session} {focus_canvas} bind:editable />
	<Svedit {session} bind:editable bind:this={svedit_ref} path={[session.doc.document_id]} />

	{#if editable}
		<div class="debug-panel-wrapper">
			<div class="debug-panel-shell flex-column gap-y-2 w-full max-w-screen-lg mx-auto">
				<p>Selection:</p>
				<pre class="debug-info">{JSON.stringify(session.selection || {}, null, '  ')}</pre>
				<p style="padding-top: 36px;">Document:</p>
				<pre class="debug-info">{JSON.stringify(session.doc, null, '  ')}</pre>
			</div>
		</div>
	{/if}
</div>

<svelte:window onkeydown={key_mapper.handle_keydown.bind(key_mapper)} />

<style>
	.debug-panel-wrapper {
		padding-block: var(--s-10);
		/*background: color-mix(in oklch, var(--app-canvas-fill) 94%, var(--app-primary-text));*/
	}

	.debug-panel-shell {
		padding: var(--s-6);
	}

	.debug-info {
		text-wrap: wrap;
		height: 12lh;
		overflow-y: auto;
		color: var(--app-primary-text);
		background: color-mix(in oklch, var(--app-canvas-fill) 98%, var(--app-primary-text));
		border: 1px solid color-mix(in oklch, var(--app-canvas-fill) 86%, var(--app-primary-text));
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 12px;
		padding: var(--s-4);
	}
</style>
