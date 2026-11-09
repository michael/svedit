/**
 * Keeps unsaved edits safe from code updates in `vite dev`.
 *
 * Saving a code file makes Vite remount the page or reload it, and an open
 * editor loses its document. While a mounted session has edits, these updates
 * are held and an "Updated · Reload" button appears instead. Stylesheet
 * updates still apply. Sessions without edits hot reload as usual.
 *
 * Vite has no API to cancel an update or reload (vitejs/vite#5763). This relies
 * on its client awaiting these listeners and reading the payload after them,
 * which holds for Vite 6 to 8:
 * - vite:beforeUpdate: entries removed from payload.updates are not applied
 * - vite:beforePrune: an emptied payload.paths keeps what the held page still uses
 * - vite:beforeFullReload: Vite only reloads when payload.path is empty or names
 *   this page, so pointing it at another .html file skips the reload
 * - vite:ws:disconnect: Vite waits for the listeners before it polls for the
 *   restarted server and reloads, so a promise that never settles holds it
 *
 * import.meta.hot is undefined in production builds, so all of this is dropped
 * there. Vite also provides it in pre-bundled dependencies, so this works for
 * apps that install Svedit from npm, with no setup.
 */
import type Session from './Session.svelte.js';

// Sessions of any application schema can hold updates.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HeldSession = Session<any>;

const sessions = new Set<HeldSession>();
let listening = false;
// Once an update was skipped the page runs outdated code, so later updates are held too
let stale = false;

function holds() {
	return stale || [...sessions].some((session) => session.history.length > 0);
}

function is_style(path: string) {
	return /\.(css|scss|sass|less|styl|stylus|pcss|postcss)(?:$|\?)/.test(path);
}

// Vite reloads a page that shows its error overlay on the next update
function remove_error_overlay() {
	for (const overlay of document.querySelectorAll('vite-error-overlay')) overlay.remove();
}

function hold() {
	stale = true;
	if (document.getElementById('svedit-reload-held')) return;
	const button = document.createElement('button');
	button.id = 'svedit-reload-held';
	button.type = 'button';
	button.textContent = 'Updated · Reload';
	button.style.cssText = 'position:fixed;top:12px;left:50%;translate:-50% 0;z-index:2147483000';
	button.addEventListener('click', () => location.reload());
	document.body.append(button);
}

export function hold_dev_reloads(session: HeldSession) {
	const hot = import.meta.hot;
	if (!hot) return;
	sessions.add(session);
	if (!listening) {
		listening = true;
		hot.on('vite:beforeUpdate', (payload) => {
			if (!holds()) return;
			const styles = payload.updates.filter((update) => is_style(update.path));
			if (styles.length < payload.updates.length) hold();
			payload.updates.splice(0, payload.updates.length, ...styles);
			remove_error_overlay();
		});
		hot.on('vite:beforePrune', (payload) => {
			if (holds()) payload.paths.length = 0;
		});
		hot.on('vite:beforeFullReload', (payload) => {
			if (!holds()) return;
			hold();
			payload.path = '/__svedit_held__.html';
		});
		hot.on('vite:error', () => {
			// The overlay is added after the listeners run
			if (holds()) setTimeout(remove_error_overlay);
		});
		hot.on('vite:ws:disconnect', () => {
			if (!holds()) return;
			hold();
			return new Promise(() => {});
		});
	}
	return () => {
		sessions.delete(session);
	};
}
