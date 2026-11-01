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
 * - An overscan IntersectionObserver (500px margin) fills the per-array
 *   `array_indices` sets of near node indices. Registration seeds them
 *   synchronously from one getBoundingClientRect, so there's no flash.
 * - An optional viewport IntersectionObserver toggles view classes
 *   (`.in-view`, `.seen`, `.fully-in-view`, `.visible-top`,
 *   `.visible-bottom`). Opt out with `session.config.view_classes = false`.
 * - `edge_map` holds per array whether its first and last nodes reached the
 *   container edges. It is recomputed on scroll inside the array (the IO does
 *   not fire there), on array resize, and after document changes.
 *
 * State lives in SvelteSets and a SvelteMap, which track reads per key, so
 * only gaps and markers whose own entries changed re-evaluate.
 *
 * @module
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { tick, untrack } from 'svelte';
import { PATH_SEPARATOR } from './utils.js';

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

class VisibilityRegistry {
	/** Per array path: whether the first/last node reached the container edge. */
	edge_map = new SvelteMap<string, EdgeState>();
	/** Toggle view classes on nodes (opt out via config.view_classes = false). */
	view_classes = true;
	/**
	 * Gate gaps and markers by viewport proximity. Disabling it (via
	 * config.visibility_culling = false) positions every gap, which makes
	 * large documents slow; intended for debugging only.
	 */
	visibility_culling = true;

	#array_indices = new Map<string, SvelteSet<number>>();
	#node_paths = new Map<HTMLElement, string>();
	#node_owners = new Map<string, HTMLElement>();
	#near_nodes = new Set<HTMLElement>();
	#arrays = new Set<Element>();
	#array_owners = new Map<string, Element>();
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
		for (const map of [
			this.#node_paths,
			this.#node_owners,
			this.#near_nodes,
			this.#arrays,
			this.#array_owners
		]) {
			map.clear();
		}
		this.edge_map.clear();
		for (const set of this.#array_indices.values()) set.clear();
	}

	/**
	 * The stable SvelteSet of near node indices of an array, created lazily.
	 *
	 * IMPORTANT: hold the returned set in its own $derived and read
	 * membership in another one (see NodeGap). Svelte doesn't track state
	 * created inside the reaction that reads it, so creating the set and
	 * reading `.has()` in one derived would never re-evaluate.
	 */
	get_array_indices(array_path: string): SvelteSet<number> {
		let set = this.#array_indices.get(array_path);
		if (!set) this.#array_indices.set(array_path, (set = new SvelteSet()));
		return set;
	}

	/** Attachment for node elements (Node.svelte and the empty-array placeholder). */
	track_node(path: string) {
		return (el: HTMLElement) => {
			this.start();
			untrack(() => {
				this.#node_paths.set(el, path);
				this.#node_owners.set(path, el);
				this.#io?.observe(el);
				this.#view_io?.observe(el);
				// Seed synchronously; the observers own later transitions
				if (!this.visibility_culling && !this.view_classes) return this.#set_near(el, path, true);
				const rect = el.getBoundingClientRect();
				const { innerWidth: width, innerHeight: height } = window;
				const intersects = (margin: number) =>
					rect.bottom > -margin &&
					rect.top < height + margin &&
					rect.right > -margin &&
					rect.left < width + margin;
				this.#set_near(el, path, !this.visibility_culling || intersects(OVERSCAN_PX));
				if (this.view_classes) apply_view_classes(el, intersects(0), rect);
			});
			return () => {
				this.#node_paths.delete(el);
				this.#io?.unobserve(el);
				this.#view_io?.unobserve(el);
				untrack(() => this.#set_near(el, path, false));
				if (this.#node_owners.get(path) === el) this.#node_owners.delete(path);
			};
		};
	}

	/** Attachment for node array containers. */
	track_array(path: string) {
		return (el: Element) => {
			this.start();
			this.#arrays.add(el);
			this.#array_owners.set(path, el);
			this.#resize_observer?.observe(el);
			// Synchronously, as the ResizeObserver's first callback comes a frame later
			this.sync_edge_state(el);
			return () => {
				this.#arrays.delete(el);
				this.#resize_observer?.unobserve(el);
				untrack(() => {
					if (this.#array_owners.get(path) !== el) return;
					this.#array_owners.delete(path);
					this.edge_map.delete(path);
				});
			};
		};
	}

	/** Whether an element is a registered node array of this registry. */
	has_array(el: Element): boolean {
		return this.#arrays.has(el);
	}

	/** Re-sync the edge state of all arrays (content changes alter scroll extents). */
	sync_all_edge_states() {
		for (const el of this.#arrays) if (el.isConnected) this.sync_edge_state(el);
	}

	/**
	 * Update an array's edge state from its own scroll metrics. Arrays that
	 * don't clip their overflow are always at both edges, which is resolved
	 * from computed style alone (no forced layout). Returns true on change.
	 */
	sync_edge_state(array_el: Element): boolean {
		const path = (array_el as HTMLElement)?.dataset?.path;
		if (!path) return false;
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
		return untrack(() => {
			const previous = this.edge_map.get(path);
			if (previous?.first === first && previous?.last === last) return false;
			this.edge_map.set(path, { first, last });
			return true;
		});
	}

	#set_near(el: HTMLElement, path: string, near: boolean): void {
		if (near) this.#near_nodes.add(el);
		else this.#near_nodes.delete(el);
		// Another element may already own the path after a keyed update
		if (!near && this.#node_owners.get(path) !== el) return;
		const split = split_path(path);
		if (!split) return;
		if (near) this.get_array_indices(split.array_path).add(split.index);
		else this.#array_indices.get(split.array_path)?.delete(split.index);
	}

	#process_near(entries: IntersectionObserverEntry[]): void {
		for (const { target, isIntersecting } of entries) {
			const el = target as HTMLElement;
			const path = this.#node_paths.get(el);
			if (!path || !el.isConnected || isIntersecting === this.#near_nodes.has(el)) continue;
			this.#set_near(el, path, isIntersecting);
		}
	}

	#process_view(entries: IntersectionObserverEntry[]): void {
		for (const { target, isIntersecting, boundingClientRect } of entries) {
			const el = target as HTMLElement;
			if (this.#node_paths.has(el) && el.isConnected)
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
	edge_map: SvelteMap<string, EdgeState>;
	get_array_indices(array_path_str: string): SvelteSet<number>;
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
	near: SvelteSet<number>,
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
