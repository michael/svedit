// The editor canvas behaviour shared by the Svelte, React, Vue and Solid
// <Svedit> components: input and composition handling, mapping the DOM
// selection to the model and back, clipboard events, and pushing the
// session keymap while the canvas has focus. Each component owns its
// reactive state and exposes it through a `CanvasHost`; this class holds
// the non-reactive bookkeeping and the handlers.
import { handle_copy } from './clipboard.js';
import { remove_native_composition_text } from './canvas_dom.js';
import {
	get_selection_from_dom,
	get_text_selection_from_dom,
	render_selection
} from './dom_selection.js';
import { handle_paste } from './editor_paste.js';
import type { KeyMapper, Keymap } from './KeyMapper.js';
import type Session from './Session.js';
import type { DocumentPath, DocumentSchema, TextSelection } from './types.js';

/**
 * What a framework's <Svedit> component exposes to the shared canvas
 * logic. The getters return the component's current (reactive) state; the
 * setters write it. A setter may flush the framework's DOM update
 * synchronously (Svelte does for `canvas_focused`, so selection highlight
 * spans are gone before the browser processes a click's selection).
 */
export type CanvasHost<S extends DocumentSchema = DocumentSchema> = {
	readonly session: Session<S>;
	readonly path: DocumentPath;
	readonly canvas_el: HTMLElement | undefined;
	readonly editable: boolean;
	readonly is_composing: boolean;
	readonly canvas_focused: boolean;
	/** The app-level KeyMapper, if one was provided. */
	readonly key_mapper: KeyMapper | undefined;
	set_is_composing(value: boolean): void;
	set_canvas_focused(value: boolean): void;
};

/**
 * Event handlers and selection rendering of the editor canvas. Create one
 * per <Svedit> instance; the handlers are bound, so they can be passed to
 * the framework's event props directly.
 */
export class CanvasController<S extends DocumentSchema = DocumentSchema> {
	#host: CanvasHost<S>;
	#before_composition_selection: TextSelection | null = null;
	// The keymap pushed on focus. Blur removes exactly this one: session.keymap
	// may be reassigned while focused, and other scopes (e.g. a modal's) may
	// have been pushed on top of it in the meantime.
	#pushed_keymap: Keymap | null = null;
	// Selection restoration and selection revealing are separate concerns.
	// DOM changes (for example, toggling an annotation) can require rebuilding
	// the native selection even when the logical selection did not move. Keep
	// the last selection rendered while focused so those rebuilds do not also
	// move the viewport.
	#last_rendered_selection_snapshot: string | null = null;
	// Set by onselectionchange before it commits a DOM-derived selection
	// to the model. render_selection consumes-and-clears it to skip
	// rerender on DOM-driven changes (the DOM is already in place).
	#selection_source_is_dom = false;

	constructor(host: CanvasHost<S>) {
		this.#host = host;
	}

	onbeforeinput = (event: InputEvent): void => {
		// console.log(`onbeforeinput: ${event.inputType}, data: "${event.data}", isComposing: ${event.isComposing}`, event);
		const session = this.#host.session;

		if (event.inputType === 'historyUndo' && this.#host.is_composing) {
			// Let the historyundo event pass through (when triggered from within oncompositionend)
			return;
		}

		// Sometimes the part that should be replaced is not the same as the current DOM selection
		// that's why we look into event.getTargetRanges()[0] if it exists.
		let target_selection: TextSelection | null | undefined;
		if (event.getTargetRanges?.()?.[0]) {
			target_selection = get_text_selection_from_dom(event.getTargetRanges()[0]);
		}

		// While composing, Svedit does nothing and lets the oncompositionend
		// event handle the final replacement.
		if (event.isComposing) {
			// NOTE: We only capture the initial selection right after the composition started
			// We're not interested in the target selections during the composition.
			if (!this.#before_composition_selection) {
				this.#before_composition_selection = target_selection ?? null;
			}
			return;
		}

		// NOTE: in cases we can't reliably map event.getTargetRanges()[0] to a session selection,
		// the original session.selection is used.
		if (target_selection) {
			session.selection = target_selection;
		}

		// Only take input when in a valid text selection inside the canvas
		if (!this.#host.canvas_el?.contains(document.activeElement)) {
			event.preventDefault();
			return;
		}

		if (event.inputType === 'formatBold' && session.selection?.type === 'text') {
			session.apply(session.tr.toggle_mark('strong'));
			event.preventDefault();
			event.stopPropagation();
		}

		if (event.inputType === 'formatItalic' && session.selection?.type === 'text') {
			session.apply(session.tr.toggle_mark('emphasis'));
			event.preventDefault();
			event.stopPropagation();
		}

		// NOTE: underline doesn't make much sense as a semantic mark,
		// so we rewire `cmd + u` to toggle highlights
		if (event.inputType === 'formatUnderline' && session.selection?.type === 'text') {
			session.apply(session.tr.toggle_mark('highlight'));
			event.preventDefault();
			event.stopPropagation();
		}

		if (
			['deleteContentBackward', 'deleteWordBackward', 'deleteContent'].includes(event.inputType)
		) {
			session.apply(session.tr.delete_selection('backward'));
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (['deleteContentForward', 'deleteWordForward'].includes(event.inputType)) {
			session.apply(session.tr.delete_selection('forward'));
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		// For now I reject drag+drop text movements.
		// TODO: If I want to support those, I need to handle them in such a way that
		// you can drag from one text property to another too.
		if (event.inputType === 'deleteByDrag' || event.inputType === 'insertFromDrop') {
			event.preventDefault();
			return;
		}

		// Insert the character, unless there is none.
		let inserted_text = event.data;

		// Sometimes (e.g. for replacements) the inserted_text is available via
		// event.dataTransfer, not event.data
		if (!inserted_text && event.dataTransfer) {
			inserted_text = event.dataTransfer?.getData('text/plain');
		}

		// Skip, if there's no inserted_text at all
		if (!inserted_text) {
			event.preventDefault();
			return;
		}

		const tr = session.tr;
		tr.insert_text(inserted_text);
		session.apply(tr, { batch: true });
		event.preventDefault();
	};

	/**
	 * Handles composition start events for input methods like dead keys
	 * This occurs when user starts typing a composed character (e.g., backtick for accents)
	 */
	oncompositionstart = (): void => {
		// console.log('DEBUG: oncompositionstart', event.data);
		if (this.#host.session.selection?.type !== 'text') {
			// Remove all ranges - completely clears the selection
			window.getSelection()?.removeAllRanges();

			// Restore
			setTimeout(() => {
				render_selection(this.#host.session, this.#host.canvas_el);
			}, 0);
			return;
		}

		// Disable keydown event handling during composition. This way, you can confirm
		// a diacritic (a->ä) with ENTER without causing a line break.
		if (this.#host.key_mapper) this.#host.key_mapper.skip_onkeydown = true;
		this.#host.set_is_composing(true);
		return;
	};

	/**
	 * Handles composition end events for input methods like dead keys
	 * This occurs when composition is complete (e.g., after typing 'a' following backtick to get 'à')
	 */
	oncompositionend = (event: CompositionEvent): void => {
		// console.log('DEBUG: oncompositionend, insert:', event.data, event);
		const session = this.#host.session;
		if (!this.#host.canvas_el?.contains(document.activeElement)) return;
		if (session.selection?.type === 'text') {
			// We need to remember the user's selection, as it might have changed in the process
			// of finishing a composition. For instance, the user might have selected a different
			// part of the text while composing.
			const user_selection = get_selection_from_dom(session, this.#host.canvas_el);

			// HACK: In order to restore the DOM state from before composition, we just run contenteditable's
			// native undo command. Then the DOM will be in sync again with the editor's internal state.
			document.execCommand('undo', false, null);

			// Firefox may not undo native composition DOM. If the composed text is
			// still present, remove it manually before applying the Svedit transaction.
			remove_native_composition_text(
				session,
				this.#host.canvas_el,
				this.#before_composition_selection,
				event.data
			);

			// Set the selection to where the user initiated the composition, make changes, and apply.
			// NOTE: We need to check for valid selection here, as there is a rare race condition
			// where the user had no text selection at the start of composition.
			if (this.#before_composition_selection) {
				session.selection = this.#before_composition_selection;
				// console.log('event.data', event.data);
				const tr = session.tr;
				tr.insert_text(event.data);
				session.apply(tr);
				// Recover user selection after composition. This assumes that document positions of natively
				// modified DOM (before transaction applied) are equal to the positions after the transaction.
				session.selection = user_selection;
			}

			// NOTE: We need a little timeout to nudge Safari into not handling the
			// ENTER press when confirming a diacritic
			setTimeout(() => {
				if (this.#host.key_mapper) this.#host.key_mapper.skip_onkeydown = false;
				this.#host.set_is_composing(false);
			}, 100);
		}

		// Reset this.#before_composition_selection, so we are ready for capturing the starting selection
		// of the next composition.
		this.#before_composition_selection = null;
		return;
	};

	// Map DOM selection to internal model
	onselectionchange = (): void => {
		if (!this.#host.editable) return;
		if (!this.#host.canvas_focused) return;
		if (this.#host.is_composing) return;
		const dom_selection = window.getSelection();
		if (!dom_selection.rangeCount) return;

		// Only handle selection changes if selection is within the canvas
		const range = dom_selection.getRangeAt(0);
		if (!this.#host.canvas_el?.contains(range.commonAncestorContainer)) return;
		const selection = get_selection_from_dom(this.#host.session, this.#host.canvas_el);
		if (selection) {
			// Avoid assigning a new object reference when the selection is
			// structurally identical — prevents a redundant watcher cycle
			// (render_selection → scrollIntoView) on every DOM layout change.
			if (JSON.stringify(selection) === JSON.stringify(this.#host.session.selection)) return;
			this.#selection_source_is_dom = true;
			this.#host.session.selection = selection;
		}
	};

	/**
	 * @param event - The clipboard event
	 * @param delete_selection - used by oncut()
	 */
	oncopy = (event: ClipboardEvent, delete_selection = false): void => {
		const session = this.#host.session;
		// Only handle copy events if editable and focus is within the canvas
		if (!this.#host.editable) return;
		if (!this.#host.canvas_el?.contains(document.activeElement)) return;

		handle_copy(session, event, delete_selection);
	};

	oncut = (event: ClipboardEvent): void => {
		if (!this.#host.editable) return;
		this.oncopy(event, true);
	};

	onpaste = async (event: ClipboardEvent): Promise<void> => {
		const session = this.#host.session;
		// Only handle paste events if editable and focus is within the canvas
		if (!this.#host.editable) return;
		if (!this.#host.canvas_el?.contains(document.activeElement)) return;
		await handle_paste(session, this.#host.path, event);
	};

	/** Canvas focus: push the session's keymap onto the KeyMapper stack. */
	onfocus = (): void => {
		this.#host.set_canvas_focused(true);
		const key_mapper = this.#host.key_mapper;
		if (key_mapper && !this.#pushed_keymap) {
			this.#pushed_keymap = this.#host.session.keymap;
			key_mapper.push_scope(this.#pushed_keymap);
		}
	};

	/** Canvas blur: remove the keymap pushed on focus. */
	onblur = (): void => {
		this.#host.set_canvas_focused(false);
		this.#remove_keymap();
	};

	/** Focuses the canvas (exposed to apps as `focus_canvas()`). */
	focus_canvas = (): void => {
		this.#host.set_canvas_focused(true);
		this.#host.canvas_el?.focus();
	};

	/**
	 * Renders the model selection into the DOM. Call it after the framework
	 * has updated the DOM whenever the selection, the document (which may
	 * have rebuilt the DOM under an unchanged selection, e.g. an annotation
	 * toggle) or the canvas focus changed. Skipped while the canvas is not
	 * focused, to avoid stealing focus back (e.g. when a dialog is open and
	 * selection highlight fragments re-render). The dom-driven flag is
	 * consumed first, so it never carries stale state into the next change.
	 */
	sync_selection(): void {
		const dom_driven = this.#selection_source_is_dom;
		this.#selection_source_is_dom = false;
		if (!this.#host.canvas_focused) return;
		const session = this.#host.session;
		const selection_snapshot = JSON.stringify(session.selection);
		const should_scroll_selection_into_view =
			!dom_driven && selection_snapshot !== this.#last_rendered_selection_snapshot;
		render_selection(session, this.#host.canvas_el, dom_driven, should_scroll_selection_into_view);
		this.#last_rendered_selection_snapshot = selection_snapshot;
	}

	/**
	 * Installs the document-level selectionchange and clipboard listeners.
	 * Returns the cleanup, which also removes a keymap still pushed (an
	 * editor unmounted while focused must not leave it on the app's stack).
	 *
	 * TODO: We must get rid of the global handlers here, so Svedit doesn't
	 * conflict with any app-specific event handling.
	 */
	listen(): () => void {
		document.addEventListener('selectionchange', this.onselectionchange);
		document.addEventListener('cut', this.oncut);
		document.addEventListener('copy', this.#oncopy_listener);
		document.addEventListener('paste', this.onpaste);
		return () => {
			document.removeEventListener('selectionchange', this.onselectionchange);
			document.removeEventListener('cut', this.oncut);
			document.removeEventListener('copy', this.#oncopy_listener);
			document.removeEventListener('paste', this.onpaste);
			this.#remove_keymap();
		};
	}

	// The copy listener must not receive a second argument from the DOM.
	#oncopy_listener = (event: ClipboardEvent): void => this.oncopy(event);

	#remove_keymap(): void {
		const key_mapper = this.#host.key_mapper;
		if (key_mapper && this.#pushed_keymap) {
			key_mapper.remove_scope(this.#pushed_keymap);
			this.#pushed_keymap = null;
		}
	}
}
