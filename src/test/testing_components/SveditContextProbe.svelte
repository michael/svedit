<script lang="ts">
	import { getContext } from 'svelte';
	import Overlays from '../../routes/components/Overlays.svelte';
	import type { SveditContext } from '../../lib/types.js';

	const context = getContext<SveditContext>('svedit');
	const test_global = globalThis as typeof globalThis & {
		__svedit_ctx_for_test?: SveditContext;
	};

	$effect(() => {
		test_global.__svedit_ctx_for_test = context;
		return () => {
			if (test_global.__svedit_ctx_for_test === context) {
				delete test_global.__svedit_ctx_for_test;
			}
		};
	});
</script>

<Overlays />
