import { useSveditContext as use_base_context } from '@svedit/react';
import type { SveditContext as BaseSveditContext } from '@svedit/react';
import type { document_schema } from '@svedit/demo-shared/src/demo_schema.js';

/**
 * The svedit context as provided by Svedit.tsx, with the session typed
 * against this app's document schema.
 */
export type SveditContext = BaseSveditContext<typeof document_schema>;

/**
 * Typed accessor for the svedit context. Use inside components rendered
 * under a Svedit instance instead of `useSveditContext()` — the
 * returned session is schema-typed, so values returned from `session.get(path)`
 * can be annotated with the app's `Nodes` map.
 */
export function useAppSvedit(): SveditContext {
	return use_base_context<typeof document_schema>();
}
