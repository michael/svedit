/**
 * Minimal Solid render helper for the browser test suite (there is no
 * vitest-browser-solid release for vitest 5).
 *
 * `render(() => <Comp ... />)` mounts the component into a fresh container
 * appended to `document.body` and returns the container plus an `unmount`
 * function. `cleanup()` (called from setup.ts after every test) disposes
 * every root that is still mounted and removes its container.
 */

import { render as solid_render } from 'solid-js/web';
import type { JSX } from 'solid-js';

export type RenderResult = {
	container: HTMLElement;
	unmount: () => void;
};

const mounted: Set<RenderResult> = new Set();

export function render(code: () => JSX.Element): RenderResult {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const dispose = solid_render(code, container);
	let disposed = false;
	const result: RenderResult = {
		container,
		unmount() {
			if (disposed) return;
			disposed = true;
			mounted.delete(result);
			dispose();
			container.remove();
		}
	};
	mounted.add(result);
	return result;
}

/** Disposes every rendered root and removes its container. */
export function cleanup() {
	for (const result of [...mounted]) result.unmount();
}

/**
 * Wait for pending microtasks, the counterpart of Vue's `nextTick()` and
 * Svelte's `tick()`. Solid updates the DOM synchronously after a signal
 * write outside `batch`, and runs effects right after, so a microtask is
 * enough for everything a session change caused to have happened.
 */
export function tick() {
	return Promise.resolve();
}
