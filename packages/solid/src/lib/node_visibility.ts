/**
 * Viewport visibility tracking for node arrays, the Solid glue around the
 * shared `VisibilityRegistry` from @svedit/core (see its module docs for
 * the design). The registry publishes near indices and edge state to
 * `ReactiveSet`s and a `ReactiveMap`, which track `.has()`/`.get()` per
 * key, so a registry write only re-runs the gaps and markers that read
 * the changed key.
 *
 * @module
 */
import { createEffect, on, onCleanup, onMount } from 'solid-js';
import { VisibilityRegistry } from '@svedit/core';
import type { EdgeState } from '@svedit/core';
import { ReactiveMap, ReactiveSet } from './reactivity.js';

export type VisibilityRegistryApi = VisibilityRegistry<
	ReactiveSet<number>,
	ReactiveMap<string, EdgeState>
>;

/**
 * Install the visibility registry on the svedit context.
 *
 * Must be called while the Svedit component is created: it registers
 * lifecycle hooks on the current owner. Elements register themselves via
 * the track_node / track_array attachments; document changes only
 * trigger an edge-state re-sync over the registered arrays.
 *
 * @param svedit - Svedit context (session, editable)
 */
export function create_node_visibility(svedit: {
	session: {
		config?: { view_classes?: boolean; visibility_culling?: boolean };
		doc: unknown;
	};
	editable: boolean;
	visibility_registry?: VisibilityRegistryApi;
}): void {
	const registry: VisibilityRegistryApi = new VisibilityRegistry({
		view_classes: svedit.session?.config?.view_classes,
		visibility_culling: svedit.session?.config?.visibility_culling,
		create_index_set: () => new ReactiveSet<number>(),
		edge_map: new ReactiveMap<string, EdgeState>()
	});
	svedit.visibility_registry = registry;

	onMount(() => {
		registry.connect();
		// Initial edge-state sync once the DOM has settled.
		queueMicrotask(() => registry.sync_all_edge_states());
	});

	onCleanup(() => registry.disconnect());

	// Structural inputs whose changes can alter array scroll extents
	// without recreating array elements. Selection intentionally does
	// not participate; NodeGapMarkers tracks it directly for caret state.
	// Effects run after Solid has updated the DOM.
	createEffect(
		on(
			() => [svedit.session.doc, svedit.editable],
			() => {
				if (typeof window === 'undefined') return;
				let cancelled = false;
				queueMicrotask(() => {
					if (!cancelled) registry.sync_all_edge_states();
				});
				onCleanup(() => {
					cancelled = true;
				});
			},
			{ defer: true }
		)
	);
}
