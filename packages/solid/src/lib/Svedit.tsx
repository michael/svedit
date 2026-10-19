import {
	Show,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	onMount,
	untrack,
	useContext
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { check_duplicate_paths, remove_native_composition_text } from '@svedit/core';
import {
	get_selection_from_dom,
	render_selection,
	get_text_selection_from_dom
} from '@svedit/core';
import { handle_copy } from '@svedit/core';
import { handle_paste } from '@svedit/core';
import { create_node_visibility } from './node_visibility.js';
import { KeyMapperContext, SveditContextObject } from './context.js';
import { class_names } from './solid_utils.js';
import DefaultNodeSelectionMarkers from './NodeSelectionMarkers.js';
import './styles/svedit-colors.css';
import './styles/svedit-animations.css';
import './Svedit.css';

import type {
	AnyComponent,
	DocumentSchema,
	SveditContext,
	SveditHandle,
	SveditProps,
	TextSelection
} from './types.js';
import type { Keymap } from '@svedit/core';

/**
 * The editor component: renders the document root inside a contenteditable
 * canvas, maps native DOM selections to the session's selection model (and
 * back), and handles input, composition and clipboard events.
 *
 * The Solid port of Svedit.svelte. Reactive state that descendants and
 * commands read (editable, canvas focus, composition) lives in signals
 * exposed through getters on the stable context object.
 */
export default function Svedit<S extends DocumentSchema>(props: SveditProps<S>) {
	const [local_editable, set_local_editable] = createSignal(false);
	// `editable` is controlled when the prop is passed, otherwise the editor
	// keeps the flag itself (mirrors Svelte's bind:editable / Vue's v-model).
	const editable = () => (props.editable !== undefined ? props.editable : local_editable());

	let canvas_el: HTMLDivElement | undefined;
	const [canvas_el_signal, set_canvas_el_signal] = createSignal<HTMLElement | undefined>();
	const [is_composing, set_is_composing] = createSignal(false);
	const [canvas_focused, set_canvas_focused] = createSignal(false);
	let before_composition_selection: TextSelection | null = null;
	// Selection restoration and selection revealing are separate concerns.
	// DOM changes (for example, toggling an annotation) can require rebuilding
	// the native selection even when the logical selection did not move. Keep
	// the last selection rendered while focused so those rebuilds do not also
	// move the viewport.
	let last_rendered_selection_snapshot: string | null = null;
	// Set by onselectionchange before it commits a DOM-derived selection
	// to the model. render_selection consumes-and-clears it to skip
	// rerender on DOM-driven changes (the DOM is already in place).
	let selection_source_is_dom = false;

	const root_node = createMemo(() => props.session.get(props.path));
	const Overlays = createMemo<AnyComponent | undefined>(
		() => props.session.config.system_components?.overlays
	);
	const NodeSelectionMarkers = createMemo<AnyComponent>(
		() =>
			props.session.config.system_components?.node_selection_markers ?? DefaultNodeSelectionMarkers
	);
	const RootComponent = createMemo<AnyComponent | undefined>(
		() => props.session.config.node_components[root_node().type]
	);

	const context: SveditContext<S> = {
		get session() {
			return props.session;
		},
		get editable() {
			return editable();
		},
		set editable(value: boolean) {
			// Uncontrolled: the editor owns the flag. Controlled: the owner
			// receives the change and passes it back through the prop.
			if (props.editable === undefined) set_local_editable(value);
			props.on_editable_change?.(value);
		},
		get is_composing() {
			return is_composing();
		},
		get canvas_el() {
			return canvas_el_signal();
		},
		get canvas_focused() {
			return canvas_focused();
		},
		focus_canvas
	};

	create_node_visibility(context);

	/** Expose function so parent can call it */
	const handle: SveditHandle = { focus_canvas };
	// Like Solid's element refs, the ref callback is called once on creation.
	// eslint-disable-next-line solid/reactivity
	(props.ref as ((handle: SveditHandle) => void) | undefined)?.(handle);

	onMount(() => {
		check_duplicate_paths(canvas_el);
	});

	// Get KeyMapper from context (may be undefined if not provided)
	const key_mapper = useContext(KeyMapperContext);

	// Initialize commands and keymap on the session. Runs after mount and
	// re-runs when the session or its config changes.
	createEffect(
		on(
			() => [props.session, props.session.config],
			() => untrack(() => props.session.initialize_commands(context))
		)
	);

	function onbeforeinput(event: InputEvent) {
		// console.log(`onbeforeinput: ${event.inputType}, data: "${event.data}", isComposing: ${event.isComposing}`, event);
		const session = props.session;

		if (event.inputType === 'historyUndo' && is_composing()) {
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
			if (!before_composition_selection) {
				before_composition_selection = target_selection ?? null;
			}
			return;
		}

		// NOTE: in cases we can't reliably map event.getTargetRanges()[0] to a session selection,
		// the original session.selection is used.
		if (target_selection) {
			session.selection = target_selection;
		}

		// Only take input when in a valid text selection inside the canvas
		if (!canvas_el?.contains(document.activeElement)) {
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
	}

	/**
	 * Handles composition start events for input methods like dead keys
	 * This occurs when user starts typing a composed character (e.g., backtick for accents)
	 */
	function oncompositionstart(/*event*/) {
		// console.log('DEBUG: oncompositionstart', event.data);
		if (props.session.selection?.type !== 'text') {
			// Remove all ranges - completely clears the selection
			window.getSelection()?.removeAllRanges();

			// Restore
			setTimeout(() => {
				render_selection(props.session, canvas_el);
			}, 0);
			return;
		}

		// Disable keydown event handling during composition. This way, you can confirm
		// a diacritic (a->ä) with ENTER without causing a line break.
		if (key_mapper) key_mapper.skip_onkeydown = true;
		set_is_composing(true);
		return;
	}

	/**
	 * Handles composition end events for input methods like dead keys
	 * This occurs when composition is complete (e.g., after typing 'a' following backtick to get 'à')
	 */
	function oncompositionend(event: CompositionEvent) {
		// console.log('DEBUG: oncompositionend, insert:', event.data, event);
		const session = props.session;
		if (!canvas_el?.contains(document.activeElement)) return;
		if (session.selection?.type === 'text') {
			// We need to remember the user's selection, as it might have changed in the process
			// of finishing a composition. For instance, the user might have selected a different
			// part of the text while composing.
			const user_selection = get_selection_from_dom(session, canvas_el);

			// HACK: In order to restore the DOM state from before composition, we just run contenteditable's
			// native undo command. Then the DOM will be in sync again with the editor's internal state.
			document.execCommand('undo', false, null);

			// Firefox may not undo native composition DOM. If the composed text is
			// still present, remove it manually before applying the Svedit transaction.
			remove_native_composition_text(session, canvas_el, before_composition_selection, event.data);

			// Set the selection to where the user initiated the composition, make changes, and apply.
			// NOTE: We need to check for valid selection here, as there is a rare race condition
			// where the user had no text selection at the start of composition.
			if (before_composition_selection) {
				session.selection = before_composition_selection;
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
				if (key_mapper) key_mapper.skip_onkeydown = false;
				set_is_composing(false);
			}, 100);
		}

		// Reset before_composition_selection, so we are ready for capturing the starting selection
		// of the next composition.
		before_composition_selection = null;
		return;
	}

	// Map DOM selection to internal model
	function onselectionchange() {
		if (!editable()) return;
		if (!canvas_focused()) return;
		if (is_composing()) return;
		const dom_selection = window.getSelection();
		if (!dom_selection.rangeCount) return;

		// Only handle selection changes if selection is within the canvas
		const range = dom_selection.getRangeAt(0);
		if (!canvas_el?.contains(range.commonAncestorContainer)) return;
		const selection = get_selection_from_dom(props.session, canvas_el);
		if (selection) {
			// Avoid assigning a new object reference when the selection is
			// structurally identical — prevents a redundant watcher cycle
			// (render_selection → scrollIntoView) on every DOM layout change.
			if (JSON.stringify(selection) === JSON.stringify(props.session.selection)) return;
			selection_source_is_dom = true;
			props.session.selection = selection;
		}
	}

	/**
	 * @param event - The clipboard event
	 * @param delete_selection - used by oncut()
	 */
	function oncopy(event: ClipboardEvent, delete_selection = false) {
		const session = props.session;
		// Only handle copy events if editable and focus is within the canvas
		if (!editable()) return;
		if (!canvas_el?.contains(document.activeElement)) return;

		handle_copy(session, event, delete_selection);
	}

	function oncut(event: ClipboardEvent) {
		if (!editable()) return;
		oncopy(event, true);
	}

	async function onpaste(event: ClipboardEvent) {
		const session = props.session;
		// Only handle paste events if editable and focus is within the canvas
		if (!editable()) return;
		if (!canvas_el?.contains(document.activeElement)) return;
		await handle_paste(session, props.path, event);
	}

	// The keymap pushed on focus. Blur removes exactly this one: session.keymap
	// may be reassigned while focused, and other scopes (e.g. a modal's) may
	// have been pushed on top of it in the meantime.
	let pushed_keymap: Keymap | null = null;

	// Handle focus - push session's keymap onto stack.
	function handle_canvas_focus() {
		set_canvas_focused(true);
		if (key_mapper && !pushed_keymap) {
			pushed_keymap = untrack(() => props.session.keymap);
			key_mapper.push_scope(pushed_keymap);
		}
	}

	// Handle blur - remove the document's keymap from the stack.
	function handle_canvas_blur() {
		set_canvas_focused(false);
		if (key_mapper && pushed_keymap) {
			key_mapper.remove_scope(pushed_keymap);
			pushed_keymap = null;
		}
	}

	function focus_canvas() {
		set_canvas_focused(true);
		canvas_el?.focus();
	}

	// Whenever the model selection, the document (which may have rebuilt the DOM
	// under an unchanged selection, e.g. an annotation toggle) or the canvas focus
	// changes, render the selection. Effects run after Solid has updated the DOM.
	// Skip when canvas is not focused to avoid stealing focus back
	// (e.g., when a dialog is open and selection highlight fragments re-render).
	// Consume the dom-driven flag at the top so it never carries stale
	// state into the next change, even when we early-return.
	createEffect(
		on(
			[() => props.session.selection, () => props.session.doc, canvas_focused],
			() => {
				const dom_driven = selection_source_is_dom;
				selection_source_is_dom = false;
				if (!canvas_focused()) return;
				const selection_snapshot = JSON.stringify(props.session.selection);
				const should_scroll_selection_into_view =
					!dom_driven && selection_snapshot !== last_rendered_selection_snapshot;
				render_selection(props.session, canvas_el, dom_driven, should_scroll_selection_into_view);
				last_rendered_selection_snapshot = selection_snapshot;
			},
			{ defer: true }
		)
	);

	// TODO: We must get rid of the global handlers here, so Svedit doesn't conflict
	// with any app-specific event handling.
	onMount(() => {
		document.addEventListener('selectionchange', onselectionchange);
		document.addEventListener('cut', oncut);
		document.addEventListener('copy', oncopy);
		document.addEventListener('paste', onpaste);
	});

	onCleanup(() => {
		document.removeEventListener('selectionchange', onselectionchange);
		document.removeEventListener('cut', oncut);
		document.removeEventListener('copy', oncopy);
		document.removeEventListener('paste', onpaste);
		// Unmounting while focused (route change, remount with a new key) must
		// not leave the session keymap on the app's KeyMapper stack.
		if (key_mapper && pushed_keymap) {
			key_mapper.remove_scope(pushed_keymap);
			pushed_keymap = null;
		}
	});

	// focus and blur are attached natively (on:), and they do not bubble, so
	// only the canvas itself gaining or losing focus counts.
	const selection = () => props.session.selection;
	const is_node_caret = () => {
		const current = selection();
		return current?.type === 'node' && current.anchor_offset === current.focus_offset;
	};

	return (
		<SveditContextObject.Provider value={context}>
			<div class={class_names('svedit', editable() && 'editable')}>
				{/* Overlays must be before canvas so they initialize first. */}
				<Show when={editable()}>
					<Dynamic component={NodeSelectionMarkers()} />
				</Show>
				<Show when={Overlays()}>{(component) => <Dynamic component={component()} />}</Show>
				{/*
					inputmode is derived from the model selection: when a custom property
					(image, embed, etc.) is selected, set inputmode="none" so iOS does
					not open the virtual keyboard. For any other selection (text, node,
					none), allow the keyboard via inputmode="text". The browser's native
					selection-change flow updates session.selection on tap, which flips
					this attribute before iOS decides whether to show the keyboard — no
					imperative state tracking, drag detection, or click/pointerdown
					handlers are required for keyboard suppression.
				*/}
				<div
					ref={(el) => {
						canvas_el = el;
						set_canvas_el_signal(el);
					}}
					class={class_names(
						'svedit-canvas',
						props.class,
						editable() && selection()?.type === 'node' && 'hide-selection',
						is_node_caret() && 'node-caret',
						selection()?.type === 'property' && 'property-selection'
					)}
					inputmode={selection()?.type === 'text' ? 'text' : 'none'}
					contenteditable={editable() ? 'true' : 'false'}
					tabindex="-1"
					autocapitalize={props.autocapitalize ?? 'on'}
					spellcheck={(props.spellcheck ?? 'true') === 'true'}
					on:beforeinput={onbeforeinput}
					on:compositionstart={oncompositionstart}
					on:compositionend={oncompositionend}
					on:focus={handle_canvas_focus}
					on:blur={handle_canvas_blur}
				>
					<Show when={RootComponent()}>
						{(component) => <Dynamic component={component()} path={props.path} />}
					</Show>
				</div>
			</div>
		</SveditContextObject.Provider>
	);
}
