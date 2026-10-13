import { useCallback, useRef, useSyncExternalStore } from 'react';
import { shallow_equal } from '@svedit/core';
import type { Listener, Subscribable } from '@svedit/core';

// The store primitives live in the @svedit/core package; this module adds the
// React hooks that subscribe to them.
export { Store, derived, shallow_equal } from '@svedit/core';
export type { Listener, Subscribable } from '@svedit/core';

/**
 * Returns the previous array when the new one has the same members, so an
 * inline `[a, b]` argument doesn't resubscribe on every render.
 */
function useStableStores(stores: Subscribable[]): Subscribable[] {
	const ref = useRef(stores);
	// eslint-disable-next-line react-hooks/refs -- identity cache for the subscription list
	const previous = ref.current;
	if (previous !== stores && !shallow_equal(previous, stores)) {
		// eslint-disable-next-line react-hooks/refs -- see above
		ref.current = stores;
		return stores;
	}
	return previous;
}

function subscribe_all(stores: Subscribable[], listener: Listener): () => void {
	const unsubscribes = stores.map((store) => store.subscribe(listener));
	return () => {
		for (const unsubscribe of unsubscribes) unsubscribe();
	};
}

/**
 * Subscribes a component to one or more stores and returns `get_snapshot()`.
 * The component re-renders only when the snapshot changes according to
 * `is_equal` (defaults to `Object.is`); the previous snapshot is returned
 * otherwise, so selectors may return fresh objects as long as `is_equal`
 * knows how to compare them.
 */
export function useSnapshot<T>(
	stores: Subscribable[],
	get_snapshot: () => T,
	is_equal: (a: T, b: T) => boolean = Object.is
): T {
	const cache = useRef<{ has_value: boolean; value: T }>({ has_value: false, value: undefined });
	const stable_stores = useStableStores(stores);
	const subscribe = useCallback(
		(listener: Listener) => subscribe_all(stable_stores, listener),
		[stable_stores]
	);
	const get = () => {
		const next = get_snapshot();
		const current = cache.current;
		if (current.has_value && is_equal(current.value, next)) return current.value;
		// A snapshot that differs from the cached one must at least equal the
		// next call's result, or React's consistency check after every commit
		// sees a new value each time and re-renders until "Maximum update
		// depth exceeded". Catch it here with a message that names the cause:
		// a selector that builds a fresh array or object per call must be
		// paired with an `is_equal` that compares its contents (shallow_equal
		// for one level; nested arrays need a key such as serialize_path()).
		if (!is_equal(next, get_snapshot())) {
			throw new Error(
				'useSnapshot: the selector returns a value that is never equal to itself. Return stable references (session values are copy-on-write) or pass an is_equal that compares the returned value by content.'
			);
		}
		cache.current = { has_value: true, value: next };
		return next;
	};
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * Subscribes a component to a store and returns its version, so the
 * component re-renders on every change.
 */
export function useVersion(store: Subscribable & { version: number }): number {
	return useSyncExternalStore(
		store.subscribe,
		() => store.version,
		() => store.version
	);
}
