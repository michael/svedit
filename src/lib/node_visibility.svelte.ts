/**
 * Viewport visibility tracking for node arrays.
 *
 * CSS anchor positioning is O(N): the browser resolves every anchor() of
 * every positioned element on every layout pass. Node gaps therefore only
 * get their `.positioned` class (which activates anchor positioning) and
 * gap markers only render while their nodes are near the viewport. The DOM
 * structure stays stable either way.
 *
 * Node elements register with `{@attach registry.track_node(path)}`, node
 * array containers with `{@attach registry.track_array(path)}`, so
 * observation follows the actual DOM lifecycle, including DOM recreation
 * without a document change (e.g. dev-mode HMR). During keyed updates
 * several elements can swap paths, so per-path ownership makes teardown
 * collision-safe: a teardown only clears state its element still owns.
 *
 * Sources of truth:
 * - An overscan IntersectionObserver (500px margin) sets the per-array
 *   flags of near node indices. Registration seeds them synchronously from
 *   one getBoundingClientRect, so there's no flash.
 * - An optional viewport IntersectionObserver toggles view classes
 *   (`.in-view`, `.seen`, `.fully-in-view`, `.visible-top`,
 *   `.visible-bottom`) of near nodes. Opt out with
 *   `session.config.view_classes = false`.
 * - `edge_map` holds per array whether its first and last nodes reached the
 *   container edges. It is recomputed on scroll inside the array (the IO does
 *   not fire there), on array resize, and after document changes.
 *
 * Anchor names cost every layout pass O(N) too, so nodes and their
 * properties only carry their `anchor-name` while near the viewport, while
 * they hold or contain the selection (overlays anchor to it), or as one of
 * the first two nodes of their array (gap markers measure row gaps with
 * them). See `is_anchored`.
 *
 * State lives in KeyedState stores, which track reads per key, so only
 * components whose own entries changed re-evaluate.
 *
 * @module
 */

import { tick, untrack } from 'svelte';
import { PATH_SEPARATOR, serialize_path } from './utils.js';
import type { DocumentPath, Selection } from './types.js';

/** Nodes within this distance (px) of the viewport count as near. */
const OVERSCAN_PX = 500;

/**
 * How far (px) an edge node may overshoot its container edge while still
 * counting as "at the edge". Absorbs sub-pixel layout and scroll jitter.
 */
const EDGE_TOLERANCE_PX = 10;

type EdgeState = { first: boolean; last: boolean };

function split_path(path: string): { array_path: string; index: number } | null {
	const separator = path.lastIndexOf(PATH_SEPARATOR);
	const index = parseInt(path.slice(separator + PATH_SEPARATOR.length), 10);
	return separator < 0 || Number.isNaN(index)
		? null
		: { array_path: path.slice(0, separator), index };
}

function intersects_viewport(rect: DOMRectReadOnly, margin: number): boolean {
	return (
		rect.bottom > -margin &&
		rect.top < window.innerHeight + margin &&
		rect.right > -margin &&
		rect.left < window.innerWidth + margin
	);
}

function apply_view_classes(el: HTMLElement, in_viewport: boolean, rect: DOMRectReadOnly): void {
	const classes = el.classList;
	classes.toggle('in-view', in_viewport);
	if (!in_viewport) {
		classes.remove('fully-in-view', 'visible-top', 'visible-bottom');
		return;
	}
	const top_clipped = rect.top < -0.5;
	const bottom_clipped = rect.bottom > window.innerHeight + 0.5;
	classes.add('seen');
	classes.toggle('fully-in-view', !top_clipped && !bottom_clipped);
	classes.toggle('visible-top', !top_clipped && bottom_clipped);
	classes.toggle('visible-bottom', top_clipped && !bottom_clipped);
}

type Registration = { path: string; attached: boolean; edge?: EdgeState };

class Cell<V> {
	value: V | undefined = $state.raw();
}

/**
 * Reactive values, read per key: only readers of a changed key re-run (a
 * SvelteMap or SvelteSet makes every miss depend on every change). Cells
 * are created by writers, since Svelte doesn't track state created inside
 * the reaction that reads it. A reader of a key without a cell yet re-checks
 * once new cells were added, notified once per microtask: during a mount,
 * every reader misses and is notified only once.
 */
export class KeyedState<K, V> {
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Reactivity lives in the cells.
	#cells = new Map<K, Cell<V>>();
	// Keys holding a value other than undefined or false
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Reactivity lives in #changed.
	#keys = new Set<K>();
	#added = $state.raw(0);
	#added_pending = false;
	#changed = $state.raw(0);

	get(key: K): V | undefined {
		const cell = this.#cells.get(key);
		if (cell) return cell.value;
		void this.#added;
		return undefined;
	}

	has(key: K): boolean {
		const value = this.get(key);
		return value !== undefined && value !== false;
	}

	set(key: K, value: V | undefined): void {
		untrack(() => {
			let cell = this.#cells.get(key);
			if (!cell) {
				this.#cells.set(key, (cell = new Cell()));
				if (!this.#added_pending) {
					this.#added_pending = true;
					queueMicrotask(() => {
						this.#added_pending = false;
						this.#added += 1;
					});
				}
			}
			if (cell.value === value) return;
			cell.value = value;
			if (value === undefined || value === false) this.#keys.delete(key);
			else this.#keys.add(key);
			this.#changed += 1;
		});
	}

	delete(key: K): void {
		if (this.#cells.has(key)) this.set(key, undefined);
	}

	/** Creates the cell of a key, so its readers depend on it alone. */
	ensure(key: K, value: V): void {
		if (!this.#cells.has(key)) this.set(key, value);
	}

	clear(): void {
		for (const key of [...this.#keys]) this.set(key, undefined);
	}

	/** The keys holding a value. Depends on every change. */
	[Symbol.iterator](): IterableIterator<K> {
		void this.#changed;
		return this.#keys.values();
	}
}

/**
 * Paths of the nodes holding or containing a selection, which keep their
 * anchor names wherever they are: the nodes along the selection path, and
 * the selected nodes (or the nodes around a node caret).
 */
function get_selection_node_paths(selection: Selection | null): Set<string> {
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local set.
	const paths = new Set<string>();
	if (!selection) return paths;
	const path: DocumentPath = selection.path;
	for (let index = 1; index < path.length; index++) {
		if (typeof path[index] === 'number') paths.add(serialize_path(path.slice(0, index + 1)));
	}
	if (selection.type === 'node') {
		const start = Math.min(selection.anchor_offset, selection.focus_offset);
		const end = Math.max(selection.anchor_offset, selection.focus_offset);
		for (let index = Math.max(start - 1, 0); index <= end; index++) {
			paths.add(serialize_path([...path, index]));
		}
	}
	return paths;
}

class VisibilityRegistry {
	/** Per array path: whether the first/last node reached the container edge. */
	edge_map = new KeyedState<string, EdgeState>();
	/** Toggle view classes on nodes (opt out via config.view_classes = false). */
	view_classes = true;
	/**
	 * Gate gaps and markers by viewport proximity. Disabling it (via
	 * config.visibility_culling = false) positions every gap, which makes
	 * large documents slow; intended for debugging only.
	 */
	visibility_culling = true;

	#array_indices = new Map<string, KeyedState<number, boolean>>();
	#pins = new KeyedState<string, boolean>();
	#pinned = new Set<string>();
	// Per element registrations, and the element currently owning each path
	#nodes = new Map<HTMLElement, Registration>();
	#node_owners = new Map<string, HTMLElement>();
	#near_nodes = new Set<HTMLElement>();
	#arrays = new Map<Element, Registration>();
	#array_owners = new Map<string, Element>();
	#detached = new Set<Element>();
	#sweep: ReturnType<typeof setTimeout> | 0 = 0;
	#io: IntersectionObserver | null = null;
	#view_io: IntersectionObserver | null = null;
	#resize_observer: ResizeObserver | null = null;

	start() {
		if (typeof window === 'undefined') return;
		this.#io ??= this.visibility_culling
			? new IntersectionObserver((entries) => this.#process_near(entries), {
					rootMargin: `${OVERSCAN_PX}px`,
					threshold: [0]
				})
			: null;
		// Threshold 1 is needed for .fully-in-view
		this.#view_io ??= this.view_classes
			? new IntersectionObserver((entries) => this.#process_view(entries), { threshold: [0, 1] })
			: null;
		this.#resize_observer ??= new ResizeObserver((entries) => {
			for (const entry of entries) this.sync_edge_state(entry.target);
		});
	}

	stop() {
		this.#io?.disconnect();
		this.#view_io?.disconnect();
		this.#resize_observer?.disconnect();
		this.#io = this.#view_io = this.#resize_observer = null;
		clearTimeout(this.#sweep);
		this.#sweep = 0;
		for (const map of [
			this.#detached,
			this.#nodes,
			this.#node_owners,
			this.#near_nodes,
			this.#arrays,
			this.#array_owners
		]) {
			map.clear();
		}
		this.edge_map.clear();
		for (const flags of this.#array_indices.values()) flags.clear();
	}

	/**
	 * The stable flags of near node indices of an array, created lazily.
	 *
	 * IMPORTANT: hold the returned flags in their own $derived and read
	 * them in another one (see NodeGap). Svelte doesn't track state created
	 * inside the reaction that reads it, so creating the flags and reading
	 * `.has()` in one derived would never re-evaluate.
	 */
	get_array_indices(array_path: string): KeyedState<number, boolean> {
		let flags = this.#array_indices.get(array_path);
		if (!flags) this.#array_indices.set(array_path, (flags = new KeyedState()));
		return flags;
	}

	/** Whether the node at a path holds or contains the selection. */
	is_pinned(path: string): boolean {
		return this.#pins.has(path);
	}

	/** Pins the nodes holding or containing the selection, see is_pinned. */
	pin_selection(selection: Selection | null): void {
		const paths = get_selection_node_paths(selection);
		for (const path of this.#pinned) if (!paths.has(path)) this.#pins.set(path, false);
		for (const path of paths) this.#pins.set(path, true);
		this.#pinned = paths;
	}

	/**
	 * Attachment for node elements (Node.svelte and the empty-array placeholder).
	 *
	 * Inserting or deleting a node shifts the paths of all following nodes,
	 * which re-attaches their elements. A re-attached element keeps its
	 * registration and observed state and only moves to its new path, so a
	 * shift costs no layout reads (see #detach).
	 */
	track_node(path: string) {
		return (el: HTMLElement) => {
			this.start();
			untrack(() => {
				const registration = this.#nodes.get(el);
				if (registration) {
					registration.attached = true;
					if (registration.path === path) return;
					this.#release_node(el, registration.path);
					registration.path = path;
					return this.#claim_node(el, path);
				}
				this.#nodes.set(el, { path, attached: true });
				this.#io?.observe(el);
				// Seed synchronously; the observers own later transitions. A new
				// element takes over its path, even before the element it
				// displaced moved on.
				if (!this.visibility_culling && !this.view_classes) {
					this.#near_nodes.add(el);
					return this.#claim_node(el, path);
				}
				const rect = el.getBoundingClientRect();
				const near = !this.visibility_culling || intersects_viewport(rect, OVERSCAN_PX);
				if (near) this.#near_nodes.add(el);
				this.#claim_node(el, path);
				this.#watch_view(el, near, rect);
			});
			return () => this.#detach(el, this.#nodes.get(el));
		};
	}

	/**
	 * A connected element is being re-attached with a new path, which Svelte
	 * does in a later effect. Removed elements are disconnected first.
	 */
	#detach(el: Element, registration: Registration | undefined): void {
		if (!registration) return;
		registration.attached = false;
		if (!el.isConnected) return this.#forget(el);
		this.#detached.add(el);
		// Safety net for an element that is not re-attached after all
		this.#sweep ||= setTimeout(() => {
			this.#sweep = 0;
			for (const detached of this.#detached) this.#forget(detached);
		});
	}

	#forget(el: Element): void {
		this.#detached.delete(el);
		const node = this.#nodes.get(el as HTMLElement);
		if (node && !node.attached) {
			this.#nodes.delete(el as HTMLElement);
			this.#near_nodes.delete(el as HTMLElement);
			this.#io?.unobserve(el);
			this.#view_io?.unobserve(el);
			untrack(() => this.#release_node(el as HTMLElement, node.path));
		}
		const array = this.#arrays.get(el);
		if (array && !array.attached) {
			this.#arrays.delete(el);
			this.#resize_observer?.unobserve(el);
			untrack(() => this.#release_array(el, array.path));
		}
	}

	/** Attachment for node array containers. Re-attaching moves the registration, like track_node. */
	track_array(path: string) {
		return (el: Element) => {
			this.start();
			const registration = this.#arrays.get(el);
			if (registration) {
				registration.attached = true;
				if (registration.path !== path) {
					untrack(() => {
						this.#release_array(el, registration.path);
						registration.path = path;
						this.#claim_array(el, registration);
					});
				}
			} else {
				this.#arrays.set(el, { path, attached: true });
				this.#resize_observer?.observe(el);
				// Synchronously, as the ResizeObserver's first callback comes a frame later
				this.sync_edge_state(el);
			}
			return () => this.#detach(el, this.#arrays.get(el));
		};
	}

	/** Whether an element is a registered node array of this registry. */
	has_array(el: Element): boolean {
		return this.#arrays.has(el);
	}

	/** Re-sync the edge state of all arrays (content changes alter scroll extents). */
	sync_all_edge_states() {
		for (const el of this.#arrays.keys()) if (el.isConnected) this.sync_edge_state(el);
	}

	/**
	 * Update an array's edge state from its own scroll metrics. Arrays that
	 * don't clip their overflow are always at both edges, which is resolved
	 * from computed style alone (no forced layout). Returns true on change.
	 */
	sync_edge_state(array_el: Element): boolean {
		const registration = this.#arrays.get(array_el);
		if (!registration) return false;
		const style = getComputedStyle(array_el);
		let first = true;
		let last = true;
		if (style.overflowX !== 'visible') {
			const { scrollLeft, clientWidth, scrollWidth } = array_el;
			first = scrollLeft <= EDGE_TOLERANCE_PX;
			last = scrollLeft + clientWidth >= scrollWidth - EDGE_TOLERANCE_PX;
		}
		if (style.overflowY !== 'visible') {
			const { scrollTop, clientHeight, scrollHeight } = array_el;
			first &&= scrollTop <= EDGE_TOLERANCE_PX;
			last &&= scrollTop + clientHeight >= scrollHeight - EDGE_TOLERANCE_PX;
		}
		const previous = registration.edge;
		if (previous?.first === first && previous?.last === last) return false;
		registration.edge = { first, last };
		untrack(() => this.#claim_array(array_el, registration));
		return true;
	}

	#claim_array(el: Element, registration: Registration): void {
		this.#array_owners.set(registration.path, el);
		if (registration.edge) this.edge_map.set(registration.path, registration.edge);
	}

	#release_array(el: Element, path: string): void {
		if (this.#array_owners.get(path) !== el) return;
		this.#array_owners.delete(path);
		this.edge_map.delete(path);
	}

	/** A path's index is near exactly when the element owning the path is near. */
	#claim_node(el: HTMLElement, path: string): void {
		this.#node_owners.set(path, el);
		this.#pins.ensure(path, false);
		this.#update_index(path, this.#near_nodes.has(el));
	}

	// Another element may already own the path after a keyed update
	#release_node(el: HTMLElement, path: string): void {
		if (this.#node_owners.get(path) !== el) return;
		this.#node_owners.delete(path);
		this.#update_index(path, false);
	}

	#update_index(path: string, near: boolean): void {
		const split = split_path(path);
		if (split) this.get_array_indices(split.array_path).set(split.index, near);
	}

	#process_near(entries: IntersectionObserverEntry[]): void {
		for (const { target, isIntersecting, boundingClientRect } of entries) {
			const el = target as HTMLElement;
			const path = this.#nodes.get(el)?.path;
			if (!path || !el.isConnected || isIntersecting === this.#near_nodes.has(el)) continue;
			if (isIntersecting) this.#near_nodes.add(el);
			else this.#near_nodes.delete(el);
			if (this.#node_owners.get(path) === el) this.#claim_node(el, path);
			this.#watch_view(el, isIntersecting, boundingClientRect);
		}
	}

	/**
	 * The viewport observer only watches near nodes, since nodes in view are
	 * near, which spares it most targets on every frame. View classes are
	 * applied right away, as its first callback comes a frame later.
	 */
	#watch_view(el: HTMLElement, near: boolean, rect: DOMRectReadOnly): void {
		if (!this.#view_io) return;
		if (near) this.#view_io.observe(el);
		else this.#view_io.unobserve(el);
		if (near || el.classList.contains('in-view'))
			apply_view_classes(el, near && intersects_viewport(rect, 0), rect);
	}

	#process_view(entries: IntersectionObserverEntry[]): void {
		for (const { target, isIntersecting, boundingClientRect } of entries) {
			const el = target as HTMLElement;
			if (this.#nodes.has(el) && el.isConnected)
				apply_view_classes(el, isIntersecting, boundingClientRect);
		}
	}
}

/**
 * Install the visibility registry on the svedit context.
 *
 * @param svedit - Svedit context (session, editable)
 */
export function create_node_visibility(svedit: {
	session: {
		config?: { view_classes?: boolean; visibility_culling?: boolean };
		doc: unknown;
		selection: Selection | null;
	};
	editable: boolean;
	visibility_registry?: VisibilityRegistryApi;
}): void {
	const registry = new VisibilityRegistry();
	registry.view_classes = svedit.session?.config?.view_classes !== false;
	registry.visibility_culling = svedit.session?.config?.visibility_culling !== false;
	svedit.visibility_registry = registry;

	$effect(() => {
		if (typeof window === 'undefined') return;
		registry.start();
		// The IntersectionObserver doesn't fire for scrolling inside nested
		// scroll containers, so array scrolls are caught in the capture phase
		// and coalesced into one frame.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local set.
		const pending = new Set<Element>();
		let frame = 0;
		const flush = () => {
			frame = 0;
			for (const array_el of pending) if (array_el.isConnected) registry.sync_edge_state(array_el);
			pending.clear();
		};
		const on_scroll = (event: Event) => {
			const array_el = (event.target as Element | null)?.closest?.('[data-type="node_array"]');
			if (!array_el || !registry.has_array(array_el)) return;
			pending.add(array_el);
			frame ||= requestAnimationFrame(flush);
		};
		document.addEventListener('scroll', on_scroll, { capture: true, passive: true });
		return () => {
			document.removeEventListener('scroll', on_scroll, true);
			cancelAnimationFrame(frame);
			registry.stop();
		};
	});

	$effect.pre(() => {
		const selection = svedit.session.selection;
		untrack(() => registry.pin_selection(selection));
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		// Content changes alter array scroll extents without recreating arrays
		void svedit.session.doc;
		void svedit.editable;
		let cancelled = false;
		tick().then(() => {
			if (!cancelled) registry.sync_all_edge_states();
		});
		return () => {
			cancelled = true;
		};
	});
}

export type VisibilityRegistryApi = {
	edge_map: KeyedState<string, EdgeState>;
	get_array_indices(array_path_str: string): KeyedState<number, boolean>;
	is_pinned(path: string): boolean;
	track_node(path: string): (el: HTMLElement) => () => void;
	track_array(path: string): (el: Element) => () => void;
};

/**
 * Whether a gap gets its `.positioned` class. Mid gaps need both adjacent
 * nodes near; edge gaps need their edge node near and at the container
 * edge (scroll-aware, see edge_map).
 *
 * `near` must come from get_array_indices, held in a separate $derived.
 */
export function should_position_gap(
	near: KeyedState<number, boolean>,
	edge_state: EdgeState | undefined,
	offset: number,
	is_last: boolean,
	empty: boolean
): boolean {
	if (!near) return false;
	if (empty) return near.has(0);
	if (offset === 0) return near.has(0) && edge_state?.first === true;
	if (is_last) return near.has(offset - 1) && edge_state?.last === true;
	return near.has(offset - 1) && near.has(offset);
}

/**
 * Whether a node (or a property of it) carries its anchor name: outside
 * node arrays always, else while near the viewport, pinned by the
 * selection, or as one of the first two nodes of an anchored array.
 *
 * `near` must come from get_array_indices, held in a separate $derived.
 */
export function is_anchored(
	registry: VisibilityRegistryApi,
	near: KeyedState<number, boolean> | null,
	array_anchored: boolean,
	index: number,
	path: string
): boolean {
	if (!near) return true;
	return (array_anchored && index < 2) || near.has(index) || registry.is_pinned(path);
}
