export type Listener = () => void;

/**
 * Something components can subscribe to (React's useSyncExternalStore, or
 * any plain listener).
 */
export type Subscribable = {
	subscribe: (listener: Listener) => () => void;
};

/**
 * Bridge between a store and a framework's fine-grained reactivity.
 *
 * `track(key)` is called whenever a keyed value is read (e.g. `session.doc`
 * tracks `'doc'`); a framework binding reads a per-key signal here so the
 * surrounding effect, computed or template re-runs when that key changes.
 * `trigger(keys)` is called once per flush with every key that changed.
 *
 * The Svelte binding installs a tracker backed by `$state`, the Vue binding
 * one backed by `shallowRef`s. The React binding needs none: its components subscribe through
 * `subscribe()` and compare selected snapshots.
 */
export type Tracker = {
	track: (key: string) => void;
	trigger: (keys: Iterable<string>) => void;
};

/**
 * Minimal change-notification primitive, the framework-free stand-in for
 * Svelte's `$state.raw`, Vue's `shallowRef` and React's external store.
 * State lives in plain fields on the owning object; whenever a field is
 * reassigned the owner calls `notify(key)`, which bumps a version counter,
 * forwards the key to the installed tracker and wakes every subscriber.
 */
export class Store {
	#listeners: Set<Listener> = new Set();
	#version = 0;
	#batch_depth = 0;
	#dirty_keys: Set<string> = new Set();
	#collectors: Set<string>[] = [];
	// The store version at each key's last change, so a derived value can
	// tell whether the keys it read have changed since it was computed.
	#key_versions: Map<string, number> = new Map();

	/** Framework bridge, installed by the binding (see `Tracker`). */
	tracker: Tracker | undefined;

	constructor(tracker?: Tracker) {
		this.tracker = tracker;
	}

	/** Monotonic counter, incremented on every notify. */
	get version(): number {
		return this.#version;
	}

	/** The store version at the last change of `key` (0 if never changed). */
	key_version(key: string): number {
		return this.#key_versions.get(key) ?? 0;
	}

	subscribe = (listener: Listener): (() => void) => {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	};

	/**
	 * Records a read of `key`: forwards it to the tracker and to every
	 * `collect()` call currently in progress (used by `derived`).
	 */
	track(key: string): void {
		for (const keys of this.#collectors) keys.add(key);
		this.tracker?.track(key);
	}

	/**
	 * Runs `fn` and returns its result together with every key tracked
	 * while it ran.
	 */
	collect<T>(fn: () => T): { value: T; keys: Set<string> } {
		const keys: Set<string> = new Set();
		this.#collectors.push(keys);
		try {
			return { value: fn(), keys };
		} finally {
			this.#collectors.pop();
		}
	}

	/**
	 * Marks `key` as changed and flushes unless inside `batch()`. Stores
	 * that hold a single value can omit the key.
	 */
	notify(key: string = 'value'): void {
		this.#version += 1;
		this.#key_versions.set(key, this.#version);
		this.#dirty_keys.add(key);
		if (this.#batch_depth === 0) this.#flush();
	}

	/**
	 * Runs `fn` and defers notification until it returns, so a multi-field
	 * update (e.g. Session.apply) wakes subscribers once.
	 */
	batch<T>(fn: () => T): T {
		this.#batch_depth += 1;
		try {
			return fn();
		} finally {
			this.#batch_depth -= 1;
			if (this.#batch_depth === 0 && this.#dirty_keys.size > 0) this.#flush();
		}
	}

	#flush(): void {
		const keys = [...this.#dirty_keys];
		this.#dirty_keys.clear();
		this.tracker?.trigger(keys);
		for (const listener of [...this.#listeners]) listener();
	}
}

/**
 * What a `derived` value reads from: a `Store`, or an object that owns one
 * (a `Session`, via `session.store`).
 */
export type DerivedSource = Store | { store: Store };

/**
 * Memoizes a derived value, the stand-in for `$derived` / `computed`.
 *
 * The keys read during the computation are recorded together with their
 * versions. The cached value is returned (with a stable reference) until one
 * of those keys changes; then it is recomputed lazily on the next read. A
 * cached read tracks the keys again, so a framework effect that reads the
 * derived value depends on exactly the state the computation depended on.
 *
 * A computation that reads no tracked key at all is recomputed on every
 * store change, so values computed from untracked state cannot go stale.
 */
export function derived<T>(source: DerivedSource, compute: () => T): () => T {
	const store = source instanceof Store ? source : source.store;
	let dependencies: Map<string, number> | null = null;
	let computed_at = -1;
	let value: T;

	function is_fresh(): boolean {
		if (dependencies === null) return false;
		if (dependencies.size === 0) return store.version === computed_at;
		for (const [key, version] of dependencies) {
			if (store.key_version(key) !== version) return false;
		}
		return true;
	}

	return () => {
		if (is_fresh()) {
			for (const key of dependencies.keys()) store.track(key);
			return value;
		}
		const result = store.collect(compute);
		value = result.value;
		dependencies = new Map([...result.keys].map((key) => [key, store.key_version(key)]));
		computed_at = store.version;
		return value;
	};
}

/** Shallow equality for plain snapshot objects and arrays. */
export function shallow_equal<T>(a: T, b: T): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const a_keys = Object.keys(a);
	const b_keys = Object.keys(b);
	if (a_keys.length !== b_keys.length) return false;
	for (const key of a_keys) {
		if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
			return false;
		}
	}
	return true;
}
