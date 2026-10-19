import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Svedit, Session, KeyMapper, KeyMapperContext } from '@svedit/solid';
import type { SveditHandle } from '@svedit/solid';
import { app_config } from '../demo_config.js';
import { document_schema } from '@svedit/demo-shared/src/demo_schema.js';
import { install_harness } from '@svedit/demo-shared/src/perftest/suite.js';

type DemoSession = Session<typeof document_schema>;

/**
 * Benchmark harness for the comparison page at /perftest: the editor and
 * nothing else. The suite runs in this document via window.__svedit_perf.
 */
export default function PerfHarness() {
	const key_mapper = new KeyMapper();
	// A fresh object per mount: the keyed <Show> below re-creates the editor
	// whenever it changes, like a `key` change in the other demos.
	const [mounted, set_mounted] = createSignal<{ session: DemoSession } | null>(null);
	const [editable, set_editable] = createSignal(true);
	let svedit_handle: SveditHandle | undefined;
	let wrapper: HTMLDivElement | undefined;

	const handle_keydown = (event: KeyboardEvent) => key_mapper.handle_keydown(event);
	let uninstall: (() => void) | undefined;

	onMount(() => {
		window.addEventListener('keydown', handle_keydown);
		uninstall = install_harness({
			framework: 'Solid',
			mode: import.meta.env.DEV ? 'development' : 'production',
			async mount(doc) {
				// A signal write outside a batch updates the DOM and runs the
				// effects synchronously, so the editor is rendered on return.
				set_mounted({ session: new Session(document_schema, doc, app_config) });
			},
			session: () => mounted()?.session ?? null,
			focus: () => svedit_handle?.focus_canvas(),
			// Solid applies session changes to the DOM synchronously, effects
			// included (where the editor renders the DOM selection), when the
			// change is made, so there is nothing left to flush here.
			async settle() {},
			wrapper: () => wrapper!
		});
	});

	onCleanup(() => {
		window.removeEventListener('keydown', handle_keydown);
		uninstall?.();
	});

	return (
		<KeyMapperContext.Provider value={key_mapper}>
			<div class="perf-harness" ref={(el) => (wrapper = el)} style={{ margin: '0 auto' }}>
				<Show when={mounted()} keyed>
					{(current) => (
						<Svedit
							ref={(handle) => (svedit_handle = handle)}
							session={current.session}
							path={[current.session.doc.document_id]}
							editable={editable()}
							on_editable_change={set_editable}
						/>
					)}
				</Show>
			</div>
		</KeyMapperContext.Provider>
	);
}
