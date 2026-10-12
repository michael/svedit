import { useEffect, useMemo, useRef, useState } from 'react';
import {
	Svedit,
	Command,
	KeyMapper,
	KeyMapperContext,
	define_keymap,
	useVersion
} from '@svedit/react';
import type { SveditHandle } from '@svedit/react';
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
	const [session] = useState(() => create_demo_session());
	const app_el = useRef<HTMLDivElement>(null);
	const svedit_ref = useRef<SveditHandle>(null);
	const [editable, set_editable] = useState(true);

	// Re-render the debug panel on every session change.
	useVersion(session);

	function focus_canvas() {
		svedit_ref.current?.focus_canvas();
	}

	// App-level command context: reactive state lives in React state; the
	// context exposes it through getters and setters that read the latest
	// values from refs.
	const editable_ref = useRef(editable);
	// eslint-disable-next-line react-hooks/refs -- latest-value ref read by the app command context getters
	editable_ref.current = editable;

	const { key_mapper } = useMemo(() => {
		const app_command_context = {
			get editable() {
				return editable_ref.current;
			},
			set editable(value: boolean) {
				set_editable(value);
			},
			get session() {
				return session;
			},
			get app_el() {
				return app_el.current;
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
		return { key_mapper, app_commands };
	}, [session]);

	useEffect(() => {
		document.title = 'Svedit - Full canvas editing for React';
		const handle_keydown = (event: KeyboardEvent) => key_mapper.handle_keydown(event);
		window.addEventListener('keydown', handle_keydown);
		return () => window.removeEventListener('keydown', handle_keydown);
	}, [key_mapper]);

	return (
		<KeyMapperContext.Provider value={key_mapper}>
			<div ref={app_el} className="demo-wrapper">
				<Svedit
					ref={svedit_ref}
					session={session}
					editable={editable}
					on_editable_change={set_editable}
					path={[session.doc.document_id]}
				/>
				{/* The toolbar must render after Svedit: its floating variant is CSS-anchored
				    to elements inside the canvas, and anchors must precede the positioned
				    element in DOM order to be resolvable. */}
				<Toolbar
					session={session}
					focus_canvas={focus_canvas}
					editable={editable}
					on_editable_change={set_editable}
				/>

				{editable && (
					<div className="debug-panel-wrapper">
						<div className="debug-panel-shell flex-column gap-y-2 w-full max-w-screen-lg mx-auto">
							<p>Selection:</p>
							<pre className="debug-info">
								{JSON.stringify(session.selection || {}, null, '  ')}
							</pre>
							<p style={{ paddingTop: '36px' }}>Document:</p>
							<pre className="debug-info">{JSON.stringify(session.doc, null, '  ')}</pre>
						</div>
					</div>
				)}
			</div>
		</KeyMapperContext.Provider>
	);
}
