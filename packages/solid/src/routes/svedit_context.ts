import { use_svedit } from '@svedit/solid';
import type { SveditContext as BaseSveditContext } from '@svedit/solid';
import type { document_schema } from '@svedit/demo-shared/src/demo_schema.js';

/**
 * The svedit context as provided by Svedit.tsx, with the session typed
 * against this app's document schema.
 */
export type SveditContext = BaseSveditContext<typeof document_schema>;

/**
 * Typed accessor for the svedit context. Use inside components rendered
 * under a Svedit instance instead of `use_svedit()` — the returned session
 * is schema-typed, so values returned from `session.get(path)` can be
 * annotated with the app's `Nodes` map. Its fields are reactive getters:
 * read them inside JSX, memos or effects, never destructure them.
 */
export function use_app_svedit(): SveditContext {
	return use_svedit<typeof document_schema>();
}
