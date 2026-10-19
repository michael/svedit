import { onCleanup, onMount } from 'solid-js';
import Svedit from '../../lib/Svedit.js';
import { KeyMapper } from '../../lib/index.js';
import { KeyMapperContext } from '../../lib/context.js';
import Layout from '../../routes/components/Layout.js';
import type Session from '../../lib/Session.js';

export default function SveditTestWithKeymap(props: {
	session: Session<any>;
	/** Tests may pass their own KeyMapper to inspect the scope stack. */
	key_mapper?: KeyMapper;
}) {
	// Mirror the Home.tsx setup so keydown events reach the
	// session keymap. Without this, key_mapper.push_scope() in
	// handle_canvas_focus is a no-op and dispatched Enter goes nowhere.
	// The KeyMapper is created once per mount, like the one in Home.tsx.
	// eslint-disable-next-line solid/reactivity
	const key_mapper = props.key_mapper ?? new KeyMapper();

	const handle_keydown = (event: KeyboardEvent) => key_mapper.handle_keydown(event);
	onMount(() => window.addEventListener('keydown', handle_keydown));
	onCleanup(() => window.removeEventListener('keydown', handle_keydown));

	return (
		<KeyMapperContext.Provider value={key_mapper}>
			<Layout>
				<Svedit session={props.session} editable={true} path={[props.session.doc.document_id]} />
			</Layout>
		</KeyMapperContext.Provider>
	);
}
