import type { Tracker } from '@svedit/core';

/**
 * Bridges the @svedit/core store to Svelte's reactivity: one `$state` signal per
 * tracked key. `track(key)` reads the signal, so a `$derived`, `$effect` or
 * template that reads `session.doc` depends on the `doc` key exactly like it
 * depended on the former `$state.raw` field; `trigger(keys)` bumps the
 * signals of the keys that changed. Reading a key before its first trigger
 * still subscribes, because Svelte's state proxy tracks absent properties.
 *
 * `trigger` must only write: the next version is taken from a plain map, so
 * an effect that writes session state does not also become a subscriber of
 * that state (which would loop with effect_update_depth_exceeded).
 */
export function create_tracker(): Tracker {
	const versions: Record<string, number> = $state({});
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping only, must not be reactive
	const counts: Map<string, number> = new Map();
	return {
		track(key) {
			void versions[key];
		},
		trigger(keys) {
			for (const key of keys) {
				const next = (counts.get(key) ?? 0) + 1;
				counts.set(key, next);
				versions[key] = next;
			}
		}
	};
}
