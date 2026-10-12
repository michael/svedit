import { useEffect } from 'react';
import Overlays from '../../routes/components/Overlays.js';
import { useSveditContext } from '../../lib/context.js';
import type { SveditContext } from '../../lib/types.js';

const test_global = globalThis as typeof globalThis & {
	__svedit_ctx_for_test?: SveditContext;
};

export default function SveditContextProbe() {
	const context = useSveditContext();

	useEffect(() => {
		test_global.__svedit_ctx_for_test = context;
		return () => {
			if (test_global.__svedit_ctx_for_test === context) {
				delete test_global.__svedit_ctx_for_test;
			}
		};
	}, [context]);

	return <Overlays />;
}
