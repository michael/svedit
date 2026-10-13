import { useEffect, useState } from 'react';
import Svedit from '../../lib/Svedit.js';
import { KeyMapper } from '../../lib/index.js';
import { KeyMapperContext } from '../../lib/context.js';
import Layout from '../../routes/components/Layout.js';
import type { Session } from '@svedit/core';

export default function SveditTestWithKeymap({
	session,
	key_mapper: provided_key_mapper
}: {
	session: Session<any>;
	/** Tests may pass their own KeyMapper to inspect the scope stack. */
	key_mapper?: KeyMapper;
}) {
	// Mirror the Home.tsx setup so keydown events reach the
	// session keymap. Without this, key_mapper.push_scope() in
	// handle_canvas_focus is a no-op and dispatched Enter goes nowhere.
	const [key_mapper] = useState(() => provided_key_mapper ?? new KeyMapper());

	useEffect(() => {
		const handle_keydown = (event: KeyboardEvent) => key_mapper.handle_keydown(event);
		window.addEventListener('keydown', handle_keydown);
		return () => window.removeEventListener('keydown', handle_keydown);
	}, [key_mapper]);

	return (
		<KeyMapperContext.Provider value={key_mapper}>
			<Layout>
				<Svedit session={session} editable={true} path={[session.doc.document_id]} />
			</Layout>
		</KeyMapperContext.Provider>
	);
}
