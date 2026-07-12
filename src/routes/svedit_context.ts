import { getContext } from 'svelte';
import type { AppSession } from './create_demo_session.js';

/**
 * The svedit context as provided by Svedit.svelte, with the session typed
 * against this app's document schema.
 */
export type SveditContext = {
	session: AppSession;
	editable: boolean;
	is_composing: boolean;
	canvas_el: HTMLElement | undefined;
	canvas_focused: boolean;
	focus_canvas: () => void;
	visibility_registry?: any;
};

/**
 * Typed accessor for the svedit context. Use inside components rendered
 * under a Svedit instance instead of `getContext('svedit')` — the returned
 * session is schema-typed, so `session.get_node(path, 'story').title`
 * autocompletes.
 */
export function get_svedit_context(): SveditContext {
	return getContext('svedit') as SveditContext;
}
