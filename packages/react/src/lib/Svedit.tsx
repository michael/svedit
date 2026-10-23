/* eslint-disable react-hooks/refs --
 * Svedit keeps its imperative editor state (canvas element, composition and
 * focus flags, the latest props) in stable mutable objects held in refs.
 * This is deliberate (see CLAUDE.md, "Component authoring"). The rule only
 * matters for the React Compiler, which is not used. */
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
import { CanvasController, check_duplicate_paths, serialize_path } from '@svedit/core';
import { useNodeVisibility } from './node_visibility.js';
import { KeyMapperContext, SveditContextObject } from './context.js';
import { Store, useVersion } from './reactive.js';
import { class_names } from './react_utils.js';
import DefaultNodeSelectionMarkers from './NodeSelectionMarkers.js';
import './styles/svedit-colors.css';
import './styles/svedit-animations.css';
import './Svedit.css';

import type { AnyComponent, DocumentSchema, SveditContext, SveditProps } from './types.js';
import type { FocusEvent } from 'react';

type CanvasState = {
	editable: boolean;
	is_composing: boolean;
	canvas_focused: boolean;
	canvas_el: HTMLElement | undefined;
};

/**
 * The editor component: renders the document root inside a contenteditable
 * canvas. Input, composition, clipboard and selection handling live in the
 * shared `CanvasController` from @svedit/core; this component owns the
 * reactive state and tells the controller when to render the selection.
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

	// Get KeyMapper from context (may be undefined if not provided)
	const key_mapper = useContext(KeyMapperContext);
	const latest_key_mapper = useRef(key_mapper);
	latest_key_mapper.current = key_mapper;

	// One controller per editor instance. Its host reads the latest props
	// and the mutable canvas state, so the bound handlers can be attached
	// once and always see the current session.
	const [controller] = useState(
		() =>
			new CanvasController<S>({
				get session() {
					return latest.current.session;
				},
				get path() {
					return latest.current.path;
				},
				get canvas_el() {
					return state.canvas_el;
				},
				get editable() {
					return state.editable;
				},
				get is_composing() {
					return state.is_composing;
				},
				get canvas_focused() {
					return state.canvas_focused;
				},
				get key_mapper() {
					return latest_key_mapper.current;
				},
				set_is_composing,
				// The focused state flips synchronously; React flushes the DOM
				// update (e.g. removal of selection highlight spans) at the end of
				// the discrete focus event, before the browser processes the
				// click's selection.
				set_canvas_focused
			})
	);

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
				controller.focus_canvas();
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

	// Whenever the model selection, the document (which may have rebuilt the
	// DOM under an unchanged selection, e.g. an annotation toggle) or the
	// canvas focus changes, render the selection. Runs after React committed
	// the DOM (layout effect).
	useLayoutEffect(() => {
		controller.sync_selection();
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

	// Document-level selectionchange and clipboard listeners. The cleanup also
	// removes a keymap still pushed: unmounting while focused (route change,
	// remount with a new key) must not leave it on the app's KeyMapper stack.
	useEffect(() => controller.listen(), [controller]);

	// beforeinput and composition events are attached natively: React's
	// synthetic onBeforeInput is a polyfill that does not expose
	// inputType or getTargetRanges().
	useEffect(() => {
		const canvas = state.canvas_el;
		if (!canvas) return;
		const on_beforeinput = (event: Event) => controller.onbeforeinput(event as InputEvent);
		const on_compositionend = (event: Event) =>
			controller.oncompositionend(event as CompositionEvent);
		canvas.addEventListener('beforeinput', on_beforeinput);
		canvas.addEventListener('compositionstart', controller.oncompositionstart);
		canvas.addEventListener('compositionend', on_compositionend);
		return () => {
			canvas.removeEventListener('beforeinput', on_beforeinput);
			canvas.removeEventListener('compositionstart', controller.oncompositionstart);
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
		controller.onfocus();
	};
	const on_blur = (event: FocusEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		controller.onblur();
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
