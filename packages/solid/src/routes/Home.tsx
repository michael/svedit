import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Svedit, Command, KeyMapper, KeyMapperContext, define_keymap } from '@svedit/solid';
import type { SveditHandle } from '@svedit/solid';
import Toolbar from './components/Toolbar.js';
import create_demo_session from './demo_session.js';
import './Home.css';

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
		console.log('Document saved', this.context.session.to_json());
		this.context.editable = false;
	}
}

export default function Home() {
	const session = create_demo_session();
	let app_el: HTMLDivElement | undefined;
	let svedit_handle: SveditHandle | undefined;
	const [editable, set_editable] = createSignal(true);

	function focus_canvas() {
		svedit_handle?.focus_canvas();
	}

	const app_command_context = {
		get editable() {
			return editable();
		},
		set editable(value: boolean) {
			set_editable(value);
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

	// Push app-level keymap scope
	const app_key_map = define_keymap({
		'meta+e,ctrl+e': [app_commands.edit_document],
		'meta+s,ctrl+s': [app_commands.save_document]
	});
	key_mapper.push_scope(app_key_map);

	const handle_keydown = (event: KeyboardEvent) => key_mapper.handle_keydown(event);

	onMount(() => {
		document.title = 'Svedit - Full canvas editing for Solid';
		window.addEventListener('keydown', handle_keydown);
	});

	onCleanup(() => {
		window.removeEventListener('keydown', handle_keydown);
	});

	return (
		<KeyMapperContext.Provider value={key_mapper}>
			<div ref={(el) => (app_el = el)} class="demo-wrapper">
				<Svedit
					ref={(handle) => (svedit_handle = handle)}
					session={session}
					editable={editable()}
					on_editable_change={set_editable}
					path={[session.doc.document_id]}
				/>
				{/* The toolbar must render after Svedit: its floating variant is CSS-anchored
				    to elements inside the canvas, and anchors must precede the positioned
				    element in DOM order to be resolvable. */}
				<Toolbar
					session={session}
					focus_canvas={focus_canvas}
					editable={editable()}
					on_editable_change={set_editable}
				/>

				<Show when={editable()}>
					<div class="debug-panel-wrapper">
						<div class="debug-panel-shell flex-column gap-y-2 w-full max-w-screen-lg mx-auto">
							<p>Selection:</p>
							<pre class="debug-info">{JSON.stringify(session.selection || {}, null, '  ')}</pre>
							<p style={{ 'padding-top': '36px' }}>Document:</p>
							<pre class="debug-info">{JSON.stringify(session.doc, null, '  ')}</pre>
						</div>
					</div>
				</Show>
			</div>
		</KeyMapperContext.Provider>
	);
}
