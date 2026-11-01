import { untrack } from 'svelte';
import { serialize_path } from './utils.js';
import type { DocumentPath } from './types.js';

/**
 * A value computed like a $derived, held in state that only changes when
 * the value changes by `equal`. Readers of a $derived are marked (and
 * checked) whenever its inputs change, even if it then comes out equal,
 * which adds up when the inputs are paths that every index shift changes.
 * Create during component initialization.
 */
export class Stable<T> {
	#current: T = $state.raw()!;

	constructor(compute: () => T, equal: (a: T, b: T) => boolean = Object.is) {
		this.#current = untrack(compute);
		$effect.pre(() => {
			const next = compute();
			untrack(() => {
				if (!equal(this.#current, next)) this.#current = next;
			});
		});
	}

	get current(): T {
		return this.#current;
	}
}

/**
 * Like Stable, for the element of a node or property: index shifts change
 * its path, but nothing else it renders. This one effect absorbs them: it
 * writes the new path straight to the element's data-path, so the element's
 * other attributes aren't re-evaluated, and only notifies readers of
 * `current` (computed from the path) when it changes.
 *
 * Render `data-path={tracker.path_str}` (not reactive, the effect updates
 * it) and set `tracker.el` once the element exists.
 */
export class PathTracker<T> {
	#current: T = $state.raw()!;
	path_str: string;
	el: Element | undefined;

	constructor(
		get_path: () => DocumentPath,
		compute: () => T,
		equal: (a: T, b: T) => boolean = Object.is
	) {
		this.#current = untrack(compute);
		this.path_str = untrack(() => serialize_path(get_path()));
		$effect.pre(() => {
			const next = compute();
			const path_str = serialize_path(get_path());
			untrack(() => {
				if (!equal(this.#current, next)) this.#current = next;
				if (path_str === this.path_str) return;
				this.path_str = path_str;
				this.el?.setAttribute('data-path', path_str);
			});
		});
	}

	get current(): T {
		return this.#current;
	}
}
