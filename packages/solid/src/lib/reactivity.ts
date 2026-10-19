import { batch, createSignal } from 'solid-js';
import type { Accessor, Setter } from 'solid-js';
import type { Tracker } from '@svedit/core';

type VersionSignal = { read: Accessor<number>; write: Setter<number> };

/**
 * Bridges the @svedit/core store to Solid's reactivity: one signal per
 * tracked key. `track(key)` reads the signal, so a memo, effect or JSX
 * expression that reads `session.doc` depends on the `doc` key;
 * `trigger(keys)` bumps the signals of the keys that changed, inside one
 * Solid `batch` so dependents run once per flush, after every key is
 * consistent.
 *
 * `trigger` must only write: the next version is taken from a plain map, so
 * an effect that writes session state does not also become a subscriber of
 * that state (which would make it re-run itself).
 */
export function create_tracker(): Tracker {
	const versions: Map<string, VersionSignal> = new Map();
	const counts: Map<string, number> = new Map();
	const version_signal = (key: string): VersionSignal => {
		let signal = versions.get(key);
		if (!signal) {
			const [read, write] = createSignal(0);
			signal = { read, write };
			versions.set(key, signal);
		}
		return signal;
	};
	return {
		track(key) {
			version_signal(key).read();
		},
		trigger(keys) {
			batch(() => {
				for (const key of keys) {
					const next = (counts.get(key) ?? 0) + 1;
					counts.set(key, next);
					version_signal(key).write(next);
				}
			});
		}
	};
}

/**
 * A Set whose reads are tracked per member: `has(value)` only re-runs its
 * readers when that value is added or removed, iteration and `size` re-run
 * on any change. The Solid counterpart of Vue's `shallowReactive(new Set())`
 * and Svelte's `SvelteSet`.
 */
export class ReactiveSet<T> {
	#values: Set<T> = new Set();
	#members: Map<T, VersionSignal> = new Map();
	#all: VersionSignal;

	constructor() {
		const [read, write] = createSignal(0);
		this.#all = { read, write };
	}

	#member(value: T): VersionSignal {
		let signal = this.#members.get(value);
		if (!signal) {
			const [read, write] = createSignal(0);
			signal = { read, write };
			this.#members.set(value, signal);
		}
		return signal;
	}

	has(value: T): boolean {
		this.#member(value).read();
		return this.#values.has(value);
	}

	get size(): number {
		this.#all.read();
		return this.#values.size;
	}

	add(value: T): this {
		if (this.#values.has(value)) return this;
		this.#values.add(value);
		this.#notify(value);
		return this;
	}

	delete(value: T): boolean {
		if (!this.#values.delete(value)) return false;
		this.#notify(value);
		return true;
	}

	clear(): void {
		if (this.#values.size === 0) return;
		const values = [...this.#values];
		this.#values.clear();
		batch(() => {
			for (const value of values) this.#bump(this.#member(value));
			this.#bump(this.#all);
		});
	}

	[Symbol.iterator](): IterableIterator<T> {
		this.#all.read();
		return this.#values[Symbol.iterator]();
	}

	#bump(signal: VersionSignal): void {
		signal.write((version) => version + 1);
	}

	#notify(value: T): void {
		batch(() => {
			this.#bump(this.#member(value));
			this.#bump(this.#all);
		});
	}
}

/**
 * A Map whose reads are tracked per key: `get(key)` / `has(key)` only re-run
 * their readers when that key is set or deleted. `peek(key)` reads without
 * tracking, so a writer can compare against the previous value without
 * subscribing its surrounding effect.
 */
export class ReactiveMap<K, V> {
	#values: Map<K, V> = new Map();
	#keys: Map<K, VersionSignal> = new Map();

	#key(key: K): VersionSignal {
		let signal = this.#keys.get(key);
		if (!signal) {
			const [read, write] = createSignal(0);
			signal = { read, write };
			this.#keys.set(key, signal);
		}
		return signal;
	}

	#bump(key: K): void {
		this.#key(key).write((version) => version + 1);
	}

	get(key: K): V | undefined {
		this.#key(key).read();
		return this.#values.get(key);
	}

	has(key: K): boolean {
		this.#key(key).read();
		return this.#values.has(key);
	}

	peek(key: K): V | undefined {
		return this.#values.get(key);
	}

	set(key: K, value: V): this {
		this.#values.set(key, value);
		this.#bump(key);
		return this;
	}

	delete(key: K): boolean {
		if (!this.#values.delete(key)) return false;
		this.#bump(key);
		return true;
	}

	clear(): void {
		const keys = [...this.#values.keys()];
		this.#values.clear();
		batch(() => {
			for (const key of keys) this.#bump(key);
		});
	}
}
