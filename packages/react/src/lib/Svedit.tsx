/* eslint-disable react-hooks/refs, react-hooks/immutability --
 * Svedit keeps its imperative editor state (canvas element, composition and
 * focus flags, the latest props) in stable mutable objects held in refs, and
 * assigns session.selection, which is the Session API. Both are deliberate
 * (see CLAUDE.md, "Component authoring"). These two rules only matter for the
 * React Compiler, which is not used. */
import {
	useCallback,
	useContext,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState
} from 'react';
import { serialize_path } from '@svedit/core';
import { check_duplicate_paths, remove_native_composition_text } from '@svedit/core';
import {
	get_selection_from_dom,
	render_selection,
	get_text_selection_from_dom
} from '@svedit/core';
import { handle_copy } from '@svedit/core';
import { handle_paste } from '@svedit/core';
import { useNodeVisibility } from './node_visibility.js';
import { KeyMapperContext, SveditContextObject } from './context.js';
import { Store, useVersion } from './reactive.js';
import { class_names } from './react_utils.js';
import DefaultNodeSelectionMarkers from './NodeSelectionMarkers.js';
import './styles/svedit-colors.css';
import './styles/svedit-animations.css';
import './Svedit.css';

import type {
	AnyComponent,
	DocumentSchema,
	TextSelection,
	SveditContext,
	SveditProps
} from './types.js';
import type { Keymap } from '@svedit/core';
import type { FocusEvent } from 'react';

type Locals = {
	before_composition_selection: TextSelection | null;
	// The keymap pushed on focus. Blur removes exactly this one: session.keymap
	// may be reassigned while focused, and other scopes (e.g. a modal's) may
	// have been pushed on top of it in the meantime.
	pushed_keymap: Keymap | null;
	// Selection restoration and selection revealing are separate concerns.
	// DOM changes (for example, toggling an annotation) can require rebuilding
	// the native selection even when the logical selection did not move. Keep
	// the last selection rendered while focused so those rebuilds do not also
	// move the viewport.
	last_rendered_selection_snapshot: string | null;
	// Set by onselectionchange before it commits a DOM-derived selection
	// to the model. render_selection consumes-and-clears it to skip
	// rerender on DOM-driven changes (the DOM is already in place).
	selection_source_is_dom: boolean;
};

type CanvasState = {
	editable: boolean;
	is_composing: boolean;
	canvas_focused: boolean;
	canvas_el: HTMLElement | undefined;
};

/**
 * The editor component: renders the document root inside a contenteditable
 * canvas, maps native DOM selections to the session's selection model (and
 * back), and handles input, composition and clipboard events.
 *
 * The React port of Svedit.svelte. Reactive state that descendants and
 * commands read (editable, canvas focus, composition) lives in a mutable
 * state object exposed through the stable context object; every write
 * notifies the context store so `useSvedit` subscribers re-render.
 */
export default function Svedit<S extends DocumentSchema>(props: SveditProps<S>) {
	const { session, path, className, autocapitalize = 'on', spellcheck = 'true', ref } = props;
	const [store] = useState(() => new Store());
	const [local_editable, set_local_editable] = useState(false);
	// `editable` is controlled when the prop is passed, otherwise the editor
	// keeps the flag itself (mirrors Svelte's bind:editable / Vue's v-model).
	const editable = props.editable !== undefined ? props.editable : local_editable;

	// Mutable state shared with the stable context object. `editable` is
	// synced during render so descendants rendering in the same pass see
	// the current prop; the layout effect below wakes bailed-out
	// subscribers afterwards.
	const state = useRef<CanvasState>({
		editable,
		is_composing: false,
		canvas_focused: false,
		canvas_el: undefined
	}).current;
	state.editable = editable;
	const latest = useRef(props);
	latest.current = props;
	const locals = useRef<Locals>({
		before_composition_selection: null,
		pushed_keymap: null,
		last_rendered_selection_snapshot: null,
		selection_source_is_dom: false
	}).current;

	function set_is_composing(value: boolean) {
		if (state.is_composing === value) return;
		state.is_composing = value;
		store.notify();
	}

	function set_canvas_focused(value: boolean) {
		if (state.canvas_focused === value) return;
		state.canvas_focused = value;
		store.notify();
	}

	const context = useMemo<SveditContext<S>>(
		() => ({
			get session() {
				return latest.current.session;
			},
			get editable() {
				return state.editable;
			},
			set editable(value: boolean) {
				const current = latest.current;
				// Reflect the write at once, like Svelte's bindable: a command that
				// sets `editable` and reads it back in the same tick (or a second
				// command in the same keydown) must see the new value. The next
				// render re-syncs with the prop in controlled mode.
				if (state.editable !== value) {
					state.editable = value;
					store.notify();
				}
				if (current.editable === undefined) set_local_editable(value);
				current.on_editable_change?.(value);
			},
			get is_composing() {
				return state.is_composing;
			},
			get canvas_el() {
				return state.canvas_el;
			},
			get canvas_focused() {
				return state.canvas_focused;
			},
			focus_canvas() {
				set_canvas_focused(true);
				state.canvas_el?.focus();
			},
			subscribe: store.subscribe,
			get version() {
				return store.version;
			},
			visibility_registry: undefined
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);
	const focus_canvas = context.focus_canvas;

	// Must run during render: descendants read the registry while rendering.
	useNodeVisibility(context, { doc: session.doc, editable });

	/** Expose function so parent can call it */
	useImperativeHandle(ref, () => ({ focus_canvas }), [focus_canvas]);

	// Re-render on every session and canvas-state change; descendants are
	// memoized and subscribe to what they need themselves.
	useVersion(session);
	useVersion(store);
	const selection = session.selection;
	const doc = session.doc;
	const canvas_focused = state.canvas_focused;

	const root_node = session.get(path);
	const Overlays: AnyComponent | undefined = session.config.system_components?.overlays;
	const NodeSelectionMarkers: AnyComponent =
		session.config.system_components?.node_selection_markers ?? DefaultNodeSelectionMarkers;
	const RootComponent: AnyComponent | undefined = session.config.node_components[root_node.type];
	const path_str = serialize_path(path);
	// The root element is memoized so an unchanged root bails out of
	// reconciliation; node components re-render through their own
	// subscriptions.
	const root_element = useMemo(
		() => (RootComponent ? <RootComponent path={path} /> : null),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[RootComponent, path_str]
	);
	const overlays_element = useMemo(() => (Overlays ? <Overlays /> : null), [Overlays]);

	// Get KeyMapper from context (may be undefined if not provided)
	const key_mapper = useContext(KeyMapperContext);

	function onbeforeinput(event: InputEvent) {
		// console.log(`onbeforeinput: ${event.inputType}, data: "${event.data}", isComposing: ${event.isComposing}`, event);

		if (event.inputType === 'historyUndo' && state.is_composing) {
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
			if (!locals.before_composition_selection) {
				locals.before_composition_selection = target_selection ?? null;
			}
			return;
		}

		// NOTE: in cases we can't reliably map event.getTargetRanges()[0] to a session selection,
		// the original session.selection is used.
		if (target_selection) {
			session.selection = target_selection;
		}

		// Only take input when in a valid text selection inside the canvas
		if (!state.canvas_el?.contains(document.activeElement)) {
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
		if (session.selection?.type !== 'text') {
			// Remove all ranges - completely clears the selection
			window.getSelection()?.removeAllRanges();

			// Restore
			setTimeout(() => {
				render_selection(session, state.canvas_el);
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
		if (!state.canvas_el?.contains(document.activeElement)) return;
		if (session.selection?.type === 'text') {
			// We need to remember the user's selection, as it might have changed in the process
			// of finishing a composition. For instance, the user might have selected a different
			// part of the text while composing.
			const user_selection = get_selection_from_dom(session, state.canvas_el);

			// HACK: In order to restore the DOM state from before composition, we just run contenteditable's
			// native undo command. Then the DOM will be in sync again with the editor's internal state.
			document.execCommand('undo', false, null);

			// Firefox may not undo native composition DOM. If the composed text is
			// still present, remove it manually before applying the Svedit transaction.
			remove_native_composition_text(
				session,
				state.canvas_el,
				locals.before_composition_selection,
				event.data
			);

			// Set the selection to where the user initiated the composition, make changes, and apply.
			// NOTE: We need to check for valid selection here, as there is a rare race condition
			// where the user had no text selection at the start of composition.
			if (locals.before_composition_selection) {
				session.selection = locals.before_composition_selection;
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

		// Reset locals.before_composition_selection, so we are ready for capturing the starting selection
		// of the next composition.
		locals.before_composition_selection = null;
		return;
	}

	// Map DOM selection to internal model
	function onselectionchange() {
		if (!state.editable) return;
		if (!state.canvas_focused) return;
		if (state.is_composing) return;
		const dom_selection = window.getSelection();
		if (!dom_selection.rangeCount) return;

		// Only handle selection changes if selection is within the canvas
		const range = dom_selection.getRangeAt(0);
		if (!state.canvas_el?.contains(range.commonAncestorContainer)) return;
		const selection = get_selection_from_dom(session, state.canvas_el);
		if (selection) {
			// Avoid assigning a new object reference when the selection is
			// structurally identical — prevents a redundant watcher cycle
			// (render_selection → scrollIntoView) on every DOM layout change.
			if (JSON.stringify(selection) === JSON.stringify(session.selection)) return;
			locals.selection_source_is_dom = true;
			session.selection = selection;
		}
	}

	/**
	 * @param event - The clipboard event
	 * @param delete_selection - used by oncut()
	 */
	function oncopy(event: ClipboardEvent, delete_selection = false) {
		// Only handle copy events if editable and focus is within the canvas
		if (!state.editable) return;
		if (!state.canvas_el?.contains(document.activeElement)) return;

		handle_copy(session, event, delete_selection);
	}

	function oncut(event: ClipboardEvent) {
		if (!state.editable) return;
		oncopy(event, true);
	}

	async function onpaste(event: ClipboardEvent) {
		// Only handle paste events if editable and focus is within the canvas
		if (!state.editable) return;
		if (!state.canvas_el?.contains(document.activeElement)) return;
		await handle_paste(session, path, event);
	}

	// Handle focus - push session's keymap onto stack.
	// The focused state flips synchronously; React flushes the DOM update (e.g.
	// removal of selection highlight spans) at the end of this discrete event,
	// before the browser processes the click's selection.
	function handle_canvas_focus() {
		set_canvas_focused(true);
		if (key_mapper && !locals.pushed_keymap) {
			locals.pushed_keymap = session.keymap;
			key_mapper.push_scope(locals.pushed_keymap);
		}
	}

	// Handle blur - remove the document's keymap from the stack.
	function handle_canvas_blur() {
		set_canvas_focused(false);
		if (key_mapper && locals.pushed_keymap) {
			key_mapper.remove_scope(locals.pushed_keymap);
			locals.pushed_keymap = null;
		}
	}

	// Whenever the model selection, the document (which may have rebuilt the
	// DOM under an unchanged selection, e.g. an annotation toggle) or the
	// canvas focus changes, render the selection. Runs after React committed
	// the DOM (layout effect).
	// Skip when canvas is not focused to avoid stealing focus back
	// (e.g., when a dialog is open and selection highlight fragments re-render).
	// Consume the dom-driven flag at the top so it never carries stale
	// state into the next change, even when we early-return.
	useLayoutEffect(() => {
		const dom_driven = locals.selection_source_is_dom;
		locals.selection_source_is_dom = false;
		if (!canvas_focused) return;
		const selection_snapshot = JSON.stringify(session.selection);
		const should_scroll_selection_into_view =
			!dom_driven && selection_snapshot !== locals.last_rendered_selection_snapshot;
		render_selection(session, state.canvas_el, dom_driven, should_scroll_selection_into_view);
		locals.last_rendered_selection_snapshot = selection_snapshot;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selection, doc, canvas_focused]);

	// Wake subscribers of the context store when the editable prop or the
	// session changes; descendants that rendered in the same pass already saw
	// the new value. A session swap must go through here: the memoized root
	// element bails the subtree out of reconciliation, and every `useSvedit`
	// subscribes to this store, so this notify is what makes descendants
	// re-read `context.session` and resubscribe to the new session.
	useLayoutEffect(() => {
		store.notify();
	}, [store, editable, session]);

	// Unmounting while focused (route change, remount with a new key) must not
	// leave the session keymap on the app's KeyMapper stack.
	useEffect(() => {
		return () => {
			if (key_mapper && locals.pushed_keymap) {
				key_mapper.remove_scope(locals.pushed_keymap);
				locals.pushed_keymap = null;
			}
		};
	}, [key_mapper, locals]);

	// Initialize commands and keymap on the session. Runs after mount and
	// re-runs when the session or its config changes.
	const config = session.config;
	useEffect(() => {
		session.initialize_commands(context);
	}, [session, config, context]);

	useEffect(() => {
		check_duplicate_paths(state.canvas_el);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Native listeners delegate to the handlers of the latest render, so
	// they always see the current session and props.
	const handlers = useRef({
		onbeforeinput,
		oncompositionstart,
		oncompositionend,
		onselectionchange,
		oncut,
		oncopy,
		onpaste
	});
	handlers.current = {
		onbeforeinput,
		oncompositionstart,
		oncompositionend,
		onselectionchange,
		oncut,
		oncopy,
		onpaste
	};

	// TODO: We must get rid of the global handlers here, so Svedit doesn't conflict
	// with any app-specific event handling.
	useEffect(() => {
		const on_selectionchange = () => handlers.current.onselectionchange();
		const on_cut = (event: ClipboardEvent) => handlers.current.oncut(event);
		const on_copy = (event: ClipboardEvent) => handlers.current.oncopy(event);
		const on_paste = (event: ClipboardEvent) => handlers.current.onpaste(event);
		document.addEventListener('selectionchange', on_selectionchange);
		document.addEventListener('cut', on_cut);
		document.addEventListener('copy', on_copy);
		document.addEventListener('paste', on_paste);
		return () => {
			document.removeEventListener('selectionchange', on_selectionchange);
			document.removeEventListener('cut', on_cut);
			document.removeEventListener('copy', on_copy);
			document.removeEventListener('paste', on_paste);
		};
	}, []);

	// beforeinput and composition events are attached natively: React's
	// synthetic onBeforeInput is a polyfill that does not expose
	// inputType or getTargetRanges().
	useEffect(() => {
		const canvas = state.canvas_el;
		if (!canvas) return;
		const on_beforeinput = (event: Event) => handlers.current.onbeforeinput(event as InputEvent);
		const on_compositionstart = () => handlers.current.oncompositionstart();
		const on_compositionend = (event: Event) =>
			handlers.current.oncompositionend(event as CompositionEvent);
		canvas.addEventListener('beforeinput', on_beforeinput);
		canvas.addEventListener('compositionstart', on_compositionstart);
		canvas.addEventListener('compositionend', on_compositionend);
		return () => {
			canvas.removeEventListener('beforeinput', on_beforeinput);
			canvas.removeEventListener('compositionstart', on_compositionstart);
			canvas.removeEventListener('compositionend', on_compositionend);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const canvas_ref = useCallback(
		(el: HTMLDivElement | null) => {
			if (state.canvas_el === (el ?? undefined)) return;
			state.canvas_el = el ?? undefined;
			// Descendants rendered before the ref attached; wake readers of
			// `context.canvas_el`.
			store.notify();
		},
		[state, store]
	);

	// React's onFocus/onBlur are focusin/focusout: they also fire for
	// descendants (an input inside a node component). Only the canvas itself
	// gaining or losing focus counts, like the native focus/blur listeners of
	// the Svelte and Vue editors.
	const on_focus = (event: FocusEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		handle_canvas_focus();
	};
	const on_blur = (event: FocusEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		handle_canvas_blur();
	};

	return (
		<SveditContextObject.Provider value={context}>
			<div className={class_names('svedit', editable && 'editable')}>
				{/* Overlays must be before canvas so they initialize first. */}
				{editable && <NodeSelectionMarkers />}
				{overlays_element}
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
					ref={canvas_ref}
					className={class_names(
						'svedit-canvas',
						className,
						editable && selection?.type === 'node' && 'hide-selection',
						selection?.type === 'node' &&
							selection.anchor_offset === selection.focus_offset &&
							'node-caret',
						selection?.type === 'property' && 'property-selection'
					)}
					inputMode={selection?.type === 'text' ? 'text' : 'none'}
					contentEditable={editable ? 'true' : 'false'}
					suppressContentEditableWarning
					tabIndex={-1}
					autoCapitalize={autocapitalize}
					spellCheck={spellcheck}
					onFocus={on_focus}
					onBlur={on_blur}
				>
					{root_element}
				</div>
			</div>
		</SveditContextObject.Provider>
	);
}
