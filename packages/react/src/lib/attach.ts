import { useMemo, useRef } from 'react';
import type { RefCallback } from 'react';

/**
 * An attachment runs when an element is mounted and returns an optional
 * cleanup that runs when the element is unmounted or re-attached.
 */
export type Attachment = (el: HTMLElement) => (() => void) | void;

/**
 * Element attachment hook, Svedit's equivalent of Svelte's `{@attach}`.
 *
 * Returns a ref callback for the element. The attachment re-runs
 * (cleanup, then attach) whenever `key` changes between renders or React
 * recreates the element; a new `attach` closure with an unchanged key is
 * ignored, so callers can safely create the closure inline in render.
 *
 * Attachments follow the DOM's actual lifecycle: React 19 calls the
 * returned cleanup when the element is removed — including DOM recreation
 * without a document change (e.g. dev-mode HMR component swaps), which a
 * document-driven reconciliation pass would miss.
 */
export function useAttach(key: string, attach: Attachment): RefCallback<HTMLElement> {
	const attach_ref = useRef(attach);
	// eslint-disable-next-line react-hooks/refs -- the ref callback must call the latest attach closure
	attach_ref.current = attach;
	return useMemo<RefCallback<HTMLElement>>(
		() => (el) => {
			// `key` is the memo trigger: a new ref callback identity makes React
			// run the cleanup and re-attach.
			void key;
			if (!el) return;
			const cleanup = attach_ref.current(el);
			return () => {
				if (typeof cleanup === 'function') cleanup();
			};
		},
		[key]
	);
}
