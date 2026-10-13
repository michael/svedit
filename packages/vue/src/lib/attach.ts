import type { Directive } from 'vue';

/**
 * An attachment runs when an element is mounted and returns an optional
 * cleanup that runs when the element is unmounted or re-attached.
 */
export type Attachment = (el: HTMLElement) => (() => void) | void;

/**
 * Binding value of the `v-attach` directive. The attachment re-runs
 * (cleanup, then attach) whenever `key` changes between renders; a new
 * `attach` closure with an unchanged key is ignored, so callers can
 * safely create the closure inline in render functions.
 */
export type AttachBinding = {
	key: string;
	attach: Attachment;
};

type AttachState = {
	key: string;
	cleanup: (() => void) | undefined;
};

const STATES: WeakMap<Element, AttachState> = new WeakMap();

function run_attachment(el: HTMLElement, binding: { value: AttachBinding }) {
	const cleanup = binding.value.attach(el);
	STATES.set(el, {
		key: binding.value.key,
		cleanup: typeof cleanup === 'function' ? cleanup : undefined
	});
}

/**
 * Element attachment directive, Svedit's equivalent of Svelte's `{@attach}`.
 *
 * Attachments follow the DOM's actual lifecycle: they run after the
 * element is inserted, re-run when the element is recreated or its key
 * changes, and clean up when the element is removed — including DOM
 * recreation without a document change (e.g. dev-mode HMR component
 * swaps), which a document-driven reconciliation pass would miss.
 */
export const vAttach: Directive<HTMLElement, AttachBinding> = {
	mounted(el, binding) {
		run_attachment(el, binding);
	},
	updated(el, binding) {
		const state = STATES.get(el);
		if (state && state.key === binding.value.key) return;
		state?.cleanup?.();
		run_attachment(el, binding);
	},
	unmounted(el) {
		STATES.get(el)?.cleanup?.();
		STATES.delete(el);
	}
};
