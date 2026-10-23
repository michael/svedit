/**
 * Viewport visibility tracking for node arrays, the React glue around the
 * shared `VisibilityRegistry` from @svedit/core (see its module docs for
 * the design). The registry keeps plain Sets and a plain Map; every change
 * to an array's near indices or edge state notifies that array's `Store`,
 * so consumers (NodeGap and NodeGapMarkers, both via `useSnapshot` /
 * `useVersion`) re-evaluate only when THEIR array's state changed — the
 * React equivalent of per-key reactive tracking.
 *
 * @module
 */
import { useEffect, useState } from 'react';
import { VisibilityRegistry } from '@svedit/core';
import { Store } from './reactive.js';

/** The shared registry plus the per-array change notifiers React subscribes to. */
export type VisibilityRegistryApi = VisibilityRegistry & {
	/**
	 * Returns the (lazily created, stable) change notifier for an array
	 * path. NodeGap and NodeGapMarkers subscribe to it and re-evaluate only
	 * when this array's near set or edge state changed.
	 */
	get_array_store(array_path_str: string): Store;
};

function create_registry(config?: {
	view_classes?: boolean;
	visibility_culling?: boolean;
}): VisibilityRegistryApi {
	const stores: Map<string, Store> = new Map();
	const registry = new VisibilityRegistry({
		view_classes: config?.view_classes,
		visibility_culling: config?.visibility_culling,
		on_array_change: (array_path) => stores.get(array_path)?.notify()
	}) as VisibilityRegistryApi;
	registry.get_array_store = (array_path_str) => {
		let store = stores.get(array_path_str);
		if (!store) {
			store = new Store();
			stores.set(array_path_str, store);
		}
		return store;
	};
	return registry;
}

/**
 * Install the visibility registry on the svedit context.
 *
 * Must be called during the Svedit component's render: it creates the
 * registry synchronously on first render (descendants read it while
 * rendering) and registers lifecycle effects on the component.
 *
 * @param svedit - Svedit context (session)
 * @param inputs - Structural inputs whose changes can alter array scroll
 *   extents without recreating array elements (the document and the
 *   editable flag). Selection intentionally does not participate;
 *   NodeGapMarkers tracks it directly for caret state.
 */
export function useNodeVisibility(
	svedit: {
		session: {
			config?: { view_classes?: boolean; visibility_culling?: boolean };
		};
		visibility_registry?: VisibilityRegistryApi;
	},
	inputs: { doc: unknown; editable: boolean }
): void {
	const [registry] = useState(() => create_registry(svedit.session?.config));
	// Installed during render, not in the initializer: StrictMode runs the
	// initializer twice and keeps the first registry, so a side effect there
	// would leave the context pointing at the discarded one.
	if (svedit.visibility_registry !== registry) {
		// eslint-disable-next-line react-hooks/immutability -- installs the registry on the (mutable) context object
		svedit.visibility_registry = registry;
	}

	useEffect(() => {
		registry.connect();
		// Effects run after the commit, so the DOM has settled.
		if (typeof window !== 'undefined') registry.sync_all_edge_states();
		return () => registry.disconnect();
	}, [registry]);

	// Content changes alter array scroll extents without recreating the
	// array elements, so re-sync after every committed document change.
	useEffect(() => {
		if (typeof window === 'undefined') return;
		registry.sync_all_edge_states();
	}, [registry, inputs.doc, inputs.editable]);
}
