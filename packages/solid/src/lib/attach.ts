import { createEffect, on, onCleanup } from 'solid-js';

/**
 * An attachment runs when an element is mounted and returns an optional
 * cleanup that runs when the element is unmounted or re-attached.
 */
export type Attachment = (el: HTMLElement) => (() => void) | void;

/**
 * Element attachments, Svedit's equivalent of Svelte's `{@attach}`. Call it
 * from a `ref` callback:
 *
 * ```tsx
 * <div ref={(el) => attach(el, path_str, (key) => registry.track_node(key))} />
 * ```
 *
 * The attachment runs in an effect, so after the element has been inserted
 * into the document. It re-runs (cleanup, then attach) whenever `key`
 * changes, and cleans up when the owning component is disposed. Solid calls
 * `ref` again for a recreated element (e.g. a `<Dynamic>` tag change or a
 * dev-mode HMR swap), which attaches the new element under its own owner,
 * so attachments follow the DOM's actual lifecycle.
 */
export function attach(
	el: HTMLElement,
	key: () => string,
	create_attachment: (key: string) => Attachment
): void {
	createEffect(
		on(key, (current_key) => {
			const cleanup = create_attachment(current_key)(el);
			if (typeof cleanup === 'function') onCleanup(cleanup);
		})
	);
}
