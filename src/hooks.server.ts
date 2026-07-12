/**
 * Enables the JS self-profiling API (used by the perftest lab) on dev-served
 * pages. Vite's server.headers doesn't apply to SvelteKit-rendered HTML, so
 * the header is set here.
 */
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('Document-Policy', 'js-profiling');
	return response;
};
