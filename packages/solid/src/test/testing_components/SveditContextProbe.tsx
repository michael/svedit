import { onCleanup, onMount } from 'solid-js';
import Overlays from '../../routes/components/Overlays.js';
import { use_svedit } from '../../lib/context.js';
import type { SveditContext } from '../../lib/types.js';

const test_global = globalThis as typeof globalThis & {
	__svedit_ctx_for_test?: SveditContext;
};

export default function SveditContextProbe() {
	const context = use_svedit();

	onMount(() => {
		test_global.__svedit_ctx_for_test = context;
	});

	onCleanup(() => {
		if (test_global.__svedit_ctx_for_test === context) {
			delete test_global.__svedit_ctx_for_test;
		}
	});

	return <Overlays />;
}
