<script lang="ts">
	import { setContext } from 'svelte';
	import { Svedit, Command, KeyMapper, define_keymap } from 'svedit';
	import Toolbar from './components/Toolbar.svelte';
	import create_demo_session from './demo_session.js';
	import { document_schema } from './demo_schema.js';

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

	let scroller_el: HTMLElement | undefined = $state();

	// App-shell mode, engaged only while editing. In read mode the document
	// scrolls normally, so mobile browser chrome (address bar) can minimize
	// and visitors get regular web-page behavior. While editing, the
	// document never scrolls: the canvas scrolls in a nested full-height
	// container so content stays visible behind the software keyboard.
	//
	// The mode itself is pure markup + CSS: data-editing on the shell div
	// (server-rendered, so it applies at first paint with no hydration
	// flash) consumed by :has() selectors in reset.css and the rules
	// below. Keyboard geometry lives in Svedit, which publishes
	// --svedit-keyboard-inset for pure-CSS consumers (the toolbar). The
	// JS below only hands the scroll position across the mode flip and
	// pins the window while the document is locked.
	let mode_scroll = 0;

	// Runs BEFORE the DOM flips modes: capture the outgoing mode's scroll
	// position while it still exists (the flip collapses the document,
	// respectively dissolves the shell scroller).
	$effect.pre(() => {
		mode_scroll = editable ? window.scrollY : (scroller_el?.scrollTop ?? 0);
	});

	// Runs AFTER the DOM flipped: hand the captured position to the new
	// scroller. While editing, also pin the window — iOS nudges it when
	// focusing near the keyboard, even though the locked document has
	// nothing to scroll.
	$effect(() => {
		if (editable) {
			if (scroller_el) scroller_el.scrollTop = mode_scroll;
			const pin = () => {
				if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
			};
			pin();
			window.addEventListener('scroll', pin);
			return () => window.removeEventListener('scroll', pin);
		}
		window.scrollTo(0, mode_scroll);
	});
</script>

<svelte:head>
	<title>Svedit - A tiny library for building editable websites in Svelte</title>
</svelte:head>

<div class="app-shell" data-editing={editable} bind:this={app_el}>
	<div class="app-scroller" bind:this={scroller_el}>
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
	<!-- The toolbar must render after Svedit: its floating variant is CSS-anchored
	     to elements inside the canvas, and anchors must precede the positioned
	     element in DOM order to be resolvable. The bottom toolbar is a layer in
	     the shell's single-cell grid, pinned above the keyboard via the
	     Svedit-published --svedit-keyboard-inset; the scroller's scroll-padding
	     (fed by the measured --toolbar-height) keeps revealed carets clear of
	     it. -->
	<Toolbar {session} {focus_canvas} bind:editable />
</div>

<svelte:window onkeydown={key_mapper.handle_keydown.bind(key_mapper)} />

<style>
	/* Read mode: .app-shell and .app-scroller are plain wrappers, the
	   document scrolls, browser chrome minimizes as usual. The rules below
	   only engage while editing (data-editing, server-rendered so they
	   apply at first paint — see reset.css). */
	.app-shell[data-editing='true'] {
		/* 100% through the body height chain, not 100dvh — see reset.css */
		height: 100%;
		/* Single-cell grid: scroller and toolbar occupy the same cell as
		   layers — the scroller runs the full height so content stays
		   visible behind the (translucent) keyboard, the toolbar pins
		   itself above the keyboard via --svedit-keyboard-inset. */
		display: grid;
		grid-template-rows: 1fr;
		grid-template-columns: 1fr;
	}

	.app-shell[data-editing='true'] .app-scroller {
		grid-area: 1 / 1;
		min-height: 0;
		overflow-y: auto;
		/* Keep inner overscroll from chaining into the unscrollable body */
		overscroll-behavior: contain;
		/* With viewport-fit=cover the shell renders behind the status bar /
		   Dynamic Island — keep revealed carets below it. */
		scroll-padding-top: calc(var(--s-4) + env(safe-area-inset-top, 0px));
		/* The band covered by the floating toolbar, whatever height it
		   currently has (it measures itself into --toolbar-height).
		   Svedit's cursor reveal honors this and handles the keyboard
		   itself via the visual viewport, so the keyboard inset must NOT
		   be added here. */
		scroll-padding-bottom: calc(var(--toolbar-height, 0px) + var(--s-4));
	}

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
