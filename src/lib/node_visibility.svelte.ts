/**
 * Viewport visibility tracking for node arrays.
 *
 * CSS anchor positioning is O(N): the browser resolves every anchor() of
 * every positioned element on every layout pass. Node gaps therefore only
 * get their `.positioned` class (which activates anchor positioning) and
 * gap markers only render while their nodes are near the viewport. The DOM
 * structure stays stable either way.
 *
 * Node elements register with `{@attach registry.track_node(array, key, pin)}`,
 * node array containers with `{@attach registry.track_array(array)}`, so
 * observation follows the actual DOM lifecycle, including DOM recreation
 * without a document change (e.g. dev-mode HMR). Registrations are keyed by
 * the rendered node array (a NodeArrayState) and the item key (node id and
 * occurrence), never by index: inserting or deleting a node leaves the
 * registrations and flags of the nodes after it untouched.
 *
 * Sources of truth:
 * - An overscan IntersectionObserver (500px margin) sets the near flags of
 *   items. New nodes are measured right after the update that rendered
 *   them, all in one pass, so they share one layout and there's no flash.
 * - An optional viewport IntersectionObserver toggles view classes
 *   (`.in-view`, `.seen`, `.fully-in-view`, `.visible-top`,
 *   `.visible-bottom`) of near nodes. Opt out with
 *   `session.config.view_classes = false`.
 * - `NodeArrayState.edge` holds whether an array's first and last nodes
 *   reached the container edges. It is recomputed on scroll inside the
 *   array (the IO does not fire there), on array resize, and after document
 *   changes.
 *
 * Anchor names cost every layout pass O(N) too, so nodes and their
 * properties only carry their `anchor-name` while near the viewport, while
 * they hold or contain the selection (overlays anchor to it), or as one of
 * the first two nodes of their array (gap markers measure row gaps with
 * them). See Node.svelte.
 *
 * State lives in KeyedState stores, which track reads per key, so only
 * components whose own entries changed re-evaluate.
 *
 * @module
 */

import { untrack } from 'svelte';
import type { DocumentPath, NodeId, Selection } from './types.js';

/** Nodes within this distance (px) of the viewport count as near. */
const OVERSCAN_PX = 500;

/**
 * How far (px) an edge node may overshoot its container edge while still
 * counting as "at the edge". Absorbs sub-pixel layout and scroll jitter.
 */
const EDGE_TOLERANCE_PX = 10;

/** Item key of the placeholder of an empty node array. */
export const EMPTY_KEY = '';

/** End flags of an item, see NodeArrayState.ends. */
export const FIRST = 1;
export const SECOND = 2;
export const LAST = 4;

type EdgeState = { first: boolean; last: boolean };

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

	/** Clears the value of a key, without creating its cell. */
	delete(key: K): void {
		if (this.#cells.has(key)) this.set(key, undefined);
	}

	/** Drops the cell of a key. Only for a key nothing reads anymore. */
	drop(key: K): void {
		untrack(() => {
			if (!this.#cells.delete(key)) return;
			if (this.#keys.delete(key)) this.#changed += 1;
		});
	}

	/** Creates the cell of a key, so its readers depend on it alone. */
	ensure(key: K, value: V): void {
		if (!this.#cells.has(key)) this.set(key, value);
	}

	/** Drops the cells of all other keys. Only for keys nothing reads anymore. */
	retain(keys: Set<K>): void {
		untrack(() => {
			for (const key of this.#cells.keys()) {
				if (keys.has(key)) continue;
				this.#cells.delete(key);
				if (this.#keys.delete(key)) this.#changed += 1;
			}
		});
	}

	clear(): void {
		for (const key of [...this.#keys]) this.set(key, undefined);
	}

	/** Whether any key holds a value. Not tracked. */
	any(): boolean {
		return this.#keys.size > 0;
	}

	/** The keys holding a value. Depends on every change. */
	[Symbol.iterator](): IterableIterator<K> {
		void this.#changed;
		return this.#keys.values();
	}
}

/**
 * The items of a rendered node array, by item key (node id and
 * occurrence): their neighbors, ends and visibility. Updating the keys only
 * notifies the items next to a change, so the nodes after an inserted or
 * deleted node don't re-evaluate.
 */
export class NodeArrayState {
	/** Item keys of the nodes near the viewport */
	near = new KeyedState<string, boolean>();
	/** The key of the item before each item, null for the first */
	prev = new KeyedState<string, string | null>();
	/** FIRST, SECOND and LAST flags of the items at the array's ends */
	ends = new KeyedState<string, number>();
	keys: string[] = $state.raw([]);
	/** Whether the first/last node reached the container edges */
	edge: EdgeState | undefined = $state.raw();
	/** The element owning each item key (see track_node) */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive registry map.
	owners = new Map<string, HTMLElement>();
	el: Element | null = null;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Rebuilt with the keys.
	#index_of = $derived(new Map(this.keys.map((key, index) => [key, index])));

	set_keys(keys: string[]): void {
		const previous = this.keys;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local set.
		const present = new Set(keys).add(EMPTY_KEY);
		for (const state of [this.near, this.prev, this.ends]) state.retain(present);
		keys.forEach((key, index) => {
			this.prev.set(key, index ? keys[index - 1] : null);
			// Readers of keys without a cell would re-check on every new cell
			this.ends.ensure(key, 0);
		});
		// Only the items at the ends, before or after the change, have flags
		for (const key of [previous[0], previous[1], previous.at(-1), keys[0], keys[1], keys.at(-1)]) {
			if (key === undefined || !present.has(key)) continue;
			const flags =
				(keys[0] === key ? FIRST : 0) |
				(keys[1] === key ? SECOND : 0) |
				(keys.at(-1) === key ? LAST : 0);
			this.ends.set(key, flags);
		}
		this.keys = keys;
	}

	/** The index of an item, -1 if absent. Depends on every change. */
	index_of(key: string): number {
		return this.#index_of.get(key) ?? -1;
	}

	/** The indexes of the near items, ascending. Depends on every change. */
	near_indices(): number[] {
		const indices: number[] = [];
		for (const key of this.near) {
			const index =
				key === EMPTY_KEY ? (this.keys.length ? undefined : 0) : this.#index_of.get(key);
			if (index !== undefined) indices.push(index);
		}
		return indices.sort((a, b) => a - b);
	}
}

type Pin = 'pinned' | 'selected';
type Lookup = <T>(path: Selection['path']) => T;

/**
 * Identifies an item for pinning by the scope of its node array (see
 * pin_scope_of) and its item key, e.g. `page_1.body.p_3:0`. Unlike its
 * path, it survives index shifts, and unlike its node id, it tells apart
 * the places a node is rendered.
 */
export function pin_key(scope: string, key: string): string {
	return `${scope}.${key}`;
}

/** The item key of a node array's node at an index: its id and occurrence. */
function item_key(nodes: NodeId[], index: number): string {
	let occurrence = 0;
	for (let i = 0; i < index; i++) if (nodes[i] === nodes[index]) occurrence++;
	return `${nodes[index]}:${occurrence}`;
}

/**
 * The pin scope of a rendered node array: its path with node array indexes
 * replaced by item keys, e.g. `page_1.body.story_1:0.buttons`. Continues
 * the pin key of an owning item, whose path is a prefix of the path, so
 * only indexes below it are looked up.
 */
export function pin_scope_of(
	path: DocumentPath,
	get: Lookup,
	owner?: { pin: string; path: DocumentPath }
): string {
	let scope = owner ? owner.pin : String(path[0]);
	for (let index = owner ? owner.path.length : 1; index < path.length; index++) {
		const segment = path[index];
		if (typeof segment === 'number')
			scope += `.${item_key(get<{ nodes: NodeId[] }>(path.slice(0, index)).nodes, segment)}`;
		else scope += `.${segment}`;
	}
	return scope;
}

/**
 * The items holding or containing a selection, which keep their anchor
 * names wherever they are: the items along the selection path, and the
 * items around a node selection, of which the ones inside are selected.
 */
function get_selection_pins(selection: Selection | null, get: Lookup): Map<string, Pin> {
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local map.
	const pins = new Map<string, Pin>();
	if (!selection) return pins;
	const path = selection.path;
	try {
		// The scope of each node array along the path, built like pin_scope_of
		let scope = String(path[0]);
		for (let index = 1; index < path.length; index++) {
			const segment = path[index];
			if (typeof segment !== 'number') {
				scope += `.${segment}`;
				continue;
			}
			const key = item_key(get<{ nodes: NodeId[] }>(path.slice(0, index)).nodes, segment);
			pins.set(pin_key(scope, key), 'pinned');
			scope += `.${key}`;
		}
		if (selection.type === 'node') {
			const start = Math.min(selection.anchor_offset, selection.focus_offset);
			const end = Math.max(selection.anchor_offset, selection.focus_offset);
			const nodes = get<{ nodes: NodeId[] }>(path).nodes;
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local map.
			const occurrences = new Map<NodeId, number>();
			for (let index = 0; index <= end && index < nodes.length; index++) {
				const occurrence = occurrences.get(nodes[index]) ?? 0;
				occurrences.set(nodes[index], occurrence + 1);
				if (index < start - 1) continue;
				const pin = index >= start && index < end ? 'selected' : 'pinned';
				pins.set(pin_key(scope, `${nodes[index]}:${occurrence}`), pin);
			}
		}
	} catch {
		// A selection that no longer resolves (e.g. after `session.doc = ...`) pins nothing more
	}
	return pins;
}

type NodeRegistration = { array: NodeArrayState | null; key: string; near: boolean };

class VisibilityRegistry {
	/** Toggle view classes on nodes (opt out via config.view_classes = false). */
	view_classes = true;
	/**
	 * Gate gaps and markers by viewport proximity. Disabling it (via
	 * config.visibility_culling = false) positions every gap, which makes
	 * large documents slow; intended for debugging only.
	 */
	visibility_culling = true;

	#pins = new KeyedState<string, Pin | false>();
	#pinned = new Map<string, Pin>();
	// The number of registered nodes per pin key, whose cells are kept
	#pin_users = new Map<string, number>();
	#nodes = new Map<HTMLElement, NodeRegistration>();
	#arrays = new Map<Element, NodeArrayState>();
	#io: IntersectionObserver | null = null;
	#view_io: IntersectionObserver | null = null;
	#resize_observer: ResizeObserver | null = null;
	// Node and array elements to measure after the current update, see #measure
	#unmeasured = new Set<HTMLElement>();
	#unsynced = new Set<Element>();
	#measure_pending = false;

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
		for (const array of this.#arrays.values()) {
			array.near.clear();
			array.owners.clear();
			array.edge = undefined;
		}
		this.#nodes.clear();
		this.#arrays.clear();
		this.#unmeasured.clear();
		this.#unsynced.clear();
	}

	/** The state of a registered node array element. */
	array_state(el: Element): NodeArrayState | undefined {
		return this.#arrays.get(el);
	}

	/** Whether the item (see pin_key) holds or contains the selection. */
	is_pinned(key: string): boolean {
		return this.#pins.has(key);
	}

	/** Whether the item (see pin_key) is inside a node selection. */
	is_selected(key: string): boolean {
		return this.#pins.get(key) === 'selected';
	}

	/** Pins the items holding or containing the selection, see is_pinned. */
	pin_selection(selection: Selection | null, get: Lookup): void {
		const pins = get_selection_pins(selection, get);
		for (const key of this.#pinned.keys()) {
			if (pins.has(key)) continue;
			if (this.#pin_users.has(key)) this.#pins.set(key, false);
			else this.#pins.drop(key);
		}
		for (const [key, pin] of pins) this.#pins.set(key, pin);
		this.#pinned = pins;
	}

	/** Drops the cell of a pin key once no node renders it and it's unpinned. */
	#release_pin(pin: string): void {
		const users = (this.#pin_users.get(pin) ?? 1) - 1;
		if (users > 0) return void this.#pin_users.set(pin, users);
		this.#pin_users.delete(pin);
		if (!this.#pinned.has(pin)) this.#pins.drop(pin);
	}

	/**
	 * Attachment for node elements (Node.svelte and the empty-array
	 * placeholder). Nodes outside node arrays (no `array`) only get view
	 * classes.
	 */
	track_node(array: NodeArrayState | null, key: string, pin?: string) {
		return (el: HTMLElement) => {
			this.start();
			untrack(() => {
				const near = !this.#io || (!!array && this.#seed_near(array, key));
				this.#nodes.set(el, { array, key, near });
				this.#io?.observe(el);
				if (pin) {
					this.#pin_users.set(pin, (this.#pin_users.get(pin) ?? 0) + 1);
					this.#pins.ensure(pin, false);
				}
				if (array) {
					array.owners.set(key, el);
					array.near.set(key, near);
				}
				if (this.#io || this.#view_io) this.#schedule_measure(el);
			});
			return () => {
				this.#nodes.delete(el);
				this.#unmeasured.delete(el);
				if (pin) this.#release_pin(pin);
				this.#io?.unobserve(el);
				this.#view_io?.unobserve(el);
				if (array?.owners.get(key) !== el) return;
				array.owners.delete(key);
				array.near.delete(key);
			};
		};
	}

	/**
	 * The near flag of a new element until it's measured. It takes over its
	 * key's flag, even before the element it replaces is removed. A new key
	 * starts near next to a measured near item (e.g. after splitting a
	 * text), so the measurement rarely changes it, which would cost another
	 * layout.
	 */
	#seed_near(array: NodeArrayState, key: string): boolean {
		const known = array.near.get(key);
		if (known !== undefined) return known;
		const index = array.index_of(key);
		if (index === -1) return false;
		return [array.keys[index - 1], array.keys[index + 1]].some((neighbor) => {
			const el = neighbor === undefined ? undefined : array.owners.get(neighbor);
			return !!el && !this.#unmeasured.has(el) && array.near.has(neighbor!);
		});
	}

	/** Attachment for node array containers. */
	track_array(array: NodeArrayState) {
		return (el: Element) => {
			this.start();
			array.el = el;
			this.#arrays.set(el, array);
			this.#resize_observer?.observe(el);
			// Right after the update, as the ResizeObserver's first callback comes a frame later
			this.#schedule_measure(null, el);
			return () => {
				this.#arrays.delete(el);
				this.#resize_observer?.unobserve(el);
				if (array.el === el) array.el = null;
			};
		};
	}

	/**
	 * Re-sync the edge state of arrays after the current update (content
	 * changes alter scroll extents). Only arrays with near nodes matter; the
	 * others sync once one of their nodes comes near.
	 */
	sync_all_edge_states() {
		for (const [el, array] of this.#arrays) if (array.near.any()) this.#schedule_measure(null, el);
	}

	/**
	 * Measures the new nodes and the arrays to sync once the current update
	 * is done, together, so they share one layout instead of each forcing
	 * one between the update's DOM writes. Runs before the next paint.
	 */
	#schedule_measure(el: HTMLElement | null, array_el?: Element): void {
		if (el) this.#unmeasured.add(el);
		if (array_el) this.#unsynced.add(array_el);
		if (this.#measure_pending) return;
		this.#measure_pending = true;
		queueMicrotask(() => this.#measure());
	}

	#measure(): void {
		this.#measure_pending = false;
		// All reads come before the first write
		const measured: [HTMLElement, boolean, DOMRectReadOnly][] = [];
		for (const el of this.#unmeasured) {
			const registration = this.#nodes.get(el);
			if (!registration || !el.isConnected) continue;
			const rect = el.getBoundingClientRect();
			const near = !this.#io || intersects_viewport(rect, OVERSCAN_PX);
			measured.push([el, near, rect]);
			// The edge state of an array without near nodes may be outdated
			if (near && registration.array?.el) this.#unsynced.add(registration.array.el);
		}
		const edges = [...this.#unsynced].map(
			(array_el) => [array_el, this.#read_edge(array_el)] as const
		);
		this.#unmeasured.clear();
		this.#unsynced.clear();
		for (const [array_el, edge] of edges) this.#set_edge(array_el, edge);
		for (const [el, near, rect] of measured) this.#set_near(el, near, rect);
	}

	/** Update an array's edge state, see #read_edge. */
	sync_edge_state(array_el: Element): void {
		this.#set_edge(array_el, this.#read_edge(array_el));
	}

	/**
	 * An array's edge state from its own scroll metrics. Arrays that don't
	 * clip their overflow are always at both edges, which is resolved from
	 * computed style alone (no forced layout).
	 */
	#read_edge(array_el: Element): EdgeState | null {
		if (!array_el.isConnected || !this.#arrays.has(array_el)) return null;
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
		return { first, last };
	}

	#set_edge(array_el: Element, edge: EdgeState | null): void {
		const array = this.#arrays.get(array_el);
		if (!array || !edge) return;
		const previous = untrack(() => array.edge);
		if (previous?.first === edge.first && previous?.last === edge.last) return;
		array.edge = edge;
	}

	#set_near(el: HTMLElement, near: boolean, rect: DOMRectReadOnly): void {
		const registration = this.#nodes.get(el)!;
		const { array, key } = registration;
		registration.near = near;
		if (array?.owners.get(key) === el) array.near.set(key, near);
		this.#watch_view(el, near, rect);
	}

	#process_near(entries: IntersectionObserverEntry[]): void {
		// A callback can hold several entries of a target, of which the last counts
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local map.
		const latest = new Map<HTMLElement, IntersectionObserverEntry>();
		for (const entry of entries) latest.set(entry.target as HTMLElement, entry);
		const changed: [HTMLElement, boolean, DOMRectReadOnly][] = [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local set.
		const arrays = new Set<Element>();
		for (const [el, { isIntersecting, boundingClientRect }] of latest) {
			const registration = this.#nodes.get(el);
			if (!registration || !el.isConnected || isIntersecting === registration.near) continue;
			changed.push([el, isIntersecting, boundingClientRect]);
			// The edge state of an array without near nodes may be outdated
			if (isIntersecting && registration.array?.el) arrays.add(registration.array.el);
		}
		// Edge reads before the view class writes, so they don't force a layout
		for (const array_el of arrays) this.sync_edge_state(array_el);
		for (const [el, near, rect] of changed) this.#set_near(el, near, rect);
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
		get: Lookup;
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
			if (!array_el || !registry.array_state(array_el)) return;
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

	// The nodes along the selection can change without the selection (e.g. `session.doc = ...`)
	$effect.pre(() => {
		const selection = svedit.session.selection;
		void svedit.session.doc;
		untrack(() => registry.pin_selection(selection, (path) => svedit.session.get(path)));
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		// Content changes alter array scroll extents without recreating arrays
		void svedit.session.doc;
		void svedit.editable;
		untrack(() => registry.sync_all_edge_states());
	});
}

export type VisibilityRegistryApi = {
	array_state(el: Element): NodeArrayState | undefined;
	is_pinned(key: string): boolean;
	is_selected(key: string): boolean;
	track_node(
		array: NodeArrayState | null,
		key: string,
		pin?: string
	): (el: HTMLElement) => () => void;
	track_array(array: NodeArrayState): (el: Element) => () => void;
};
