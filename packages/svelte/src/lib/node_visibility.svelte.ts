/**
 * Viewport visibility tracking for node arrays, the Svelte glue around the
 * shared `VisibilityRegistry` from @svedit/core (see its module docs for
 * the design). The registry publishes near indices and edge state to
 * SvelteSets and a SvelteMap, which track `.has()`/`.get()` per key, so a
 * registry write only re-evaluates the gaps and markers that read the
 * changed key.
 *
 * @module
 */
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { tick } from 'svelte';
import { VisibilityRegistry } from '@svedit/core';
import type { EdgeState } from '@svedit/core';

export type VisibilityRegistryApi = VisibilityRegistry<
	SvelteSet<number>,
	SvelteMap<string, EdgeState>
>;

/**
 * Install the visibility registry on the svedit context.
 *
 * Must be called during the Svedit component's initialization: it
 * registers effects on the current component. Elements register
 * themselves via the track_node / track_array attachments; document
 * changes only trigger an edge-state re-sync over the registered arrays.
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
		create_index_set: () => new SvelteSet<number>(),
		edge_map: new SvelteMap<string, EdgeState>()
	});
	svedit.visibility_registry = registry;

	$effect(() => {
		registry.connect();
		return () => registry.disconnect();
	});

	$effect(() => {
		if (typeof window === 'undefined') return;

		// Structural inputs whose changes can alter array scroll extents
		// without recreating array elements. Selection intentionally does
		// not participate; NodeGapMarkers tracks it directly for caret state.
		svedit.session.doc;
		svedit.editable;

		let cancelled = false;
		tick().then(() => {
			if (!cancelled) registry.sync_all_edge_states();
		});

		return () => {
			cancelled = true;
		};
	});
}
