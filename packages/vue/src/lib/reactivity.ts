import { shallowRef } from 'vue';
import type { ShallowRef } from 'vue';
import type { Tracker } from '@svedit/core';

/**
 * Bridges the @svedit/core store to Vue's reactivity: one shallow ref per
 * tracked key. `track(key)` reads the ref, so a computed, watcher or
 * template that reads `session.doc` depends on the `doc` key exactly like
 * it depended on the former `shallowRef` field; `trigger(keys)` bumps the
 * refs of the keys that changed.
 *
 * `trigger` must only write: the next version is taken from a plain map, so
 * an effect that writes session state does not also become a subscriber of
 * that state (which would make it re-run itself).
 */
export function create_tracker(): Tracker {
	const versions: Map<string, ShallowRef<number>> = new Map();
	const counts: Map<string, number> = new Map();
	const version_ref = (key: string): ShallowRef<number> => {
		let ref = versions.get(key);
		if (!ref) {
			ref = shallowRef(0);
			versions.set(key, ref);
		}
		return ref;
	};
	return {
		track(key) {
			void version_ref(key).value;
		},
		trigger(keys) {
			for (const key of keys) {
				const next = (counts.get(key) ?? 0) + 1;
				counts.set(key, next);
				version_ref(key).value = next;
			}
		}
	};
}
