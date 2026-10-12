import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Svedit, Session, KeyMapper, KeyMapperContext } from '@svedit/react';
import type { SveditHandle } from '@svedit/react';
import { app_config } from '../demo_config.js';
import { document_schema } from '@svedit/demo-shared/src/demo_schema.js';
import { install_harness } from '@svedit/demo-shared/src/perftest/suite.js';

type DemoSession = Session<typeof document_schema>;

/**
 * Benchmark harness for the comparison page at /perftest: the editor and
 * nothing else. The suite runs in this document via window.__svedit_perf.
 */
export default function PerfHarness() {
	const [key_mapper] = useState(() => new KeyMapper());
	const [mounted, set_mounted] = useState<{ session: DemoSession; key: number } | null>(null);
	const [editable, set_editable] = useState(true);
	const session_ref = useRef<DemoSession | null>(null);
	const svedit_ref = useRef<SveditHandle>(null);
	const wrapper_ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handle_keydown = (event: KeyboardEvent) => key_mapper.handle_keydown(event);
		window.addEventListener('keydown', handle_keydown);
		return () => window.removeEventListener('keydown', handle_keydown);
	}, [key_mapper]);

	useEffect(
		() =>
			install_harness({
				framework: 'React',
				mode: import.meta.env.DEV ? 'development' : 'production',
				async mount(doc) {
					const session = new Session(document_schema, doc, app_config);
					session_ref.current = session;
					flushSync(() => set_mounted((previous) => ({ session, key: (previous?.key ?? 0) + 1 })));
				},
				session: () => session_ref.current,
				focus: () => svedit_ref.current?.focus_canvas(),
				async settle() {
					// Session changes reach React as external-store updates; flushSync
					// renders and commits all pending synchronous work now, including
					// layout effects (where the editor renders the DOM selection).
					flushSync(() => {});
				},
				wrapper: () => wrapper_ref.current!
			}),
		[]
	);

	return (
		<KeyMapperContext.Provider value={key_mapper}>
			<div className="perf-harness" ref={wrapper_ref} style={{ margin: '0 auto' }}>
				{mounted && (
					<Svedit
						key={mounted.key}
						ref={svedit_ref}
						session={mounted.session}
						path={[mounted.session.doc.document_id]}
						editable={editable}
						on_editable_change={set_editable}
					/>
				)}
			</div>
		</KeyMapperContext.Provider>
	);
}
