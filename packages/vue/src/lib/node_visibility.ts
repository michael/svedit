/**
 * Viewport visibility tracking for node arrays, the Vue glue around the
 * shared `VisibilityRegistry` from @svedit/core (see its module docs for
 * the design). The registry publishes near indices and edge state to
 * `shallowReactive` Sets and a Map, whose collection handlers track
 * `.has()`/`.get()` per key, so a registry write only re-evaluates the
 * gaps and markers that read the changed key.
 *
 * @module
 */
import { markRaw, nextTick, onBeforeUnmount, onMounted, shallowReactive, watch } from 'vue';
import { VisibilityRegistry } from '@svedit/core';
import type { EdgeState } from '@svedit/core';

export type VisibilityRegistryApi = VisibilityRegistry<Set<number>, Map<string, EdgeState>>;

/**
 * Install the visibility registry on the svedit context.
 *
 * Must be called during the Svedit component's setup: it registers
 * lifecycle hooks on the current component instance. Elements register
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
		create_index_set: () => shallowReactive(new Set<number>()),
		edge_map: shallowReactive(new Map<string, EdgeState>())
	});
	// Private fields must never be accessed through a reactive proxy.
	markRaw(registry);
	svedit.visibility_registry = registry;

	onMounted(() => {
		registry.connect();
		// Initial edge-state sync once the DOM has settled.
		nextTick().then(() => registry.sync_all_edge_states());
	});

	onBeforeUnmount(() => registry.disconnect());

	// Structural inputs whose changes can alter array scroll extents
	// without recreating array elements. Selection intentionally does
	// not participate; NodeGapMarkers tracks it directly for caret state.
	watch(
		() => [svedit.session.doc, svedit.editable],
		(_value, _previous, on_cleanup) => {
			if (typeof window === 'undefined') return;
			let cancelled = false;
			nextTick().then(() => {
				if (!cancelled) registry.sync_all_edge_states();
			});
			on_cleanup(() => {
				cancelled = true;
			});
		},
		{ flush: 'post' }
	);
}
