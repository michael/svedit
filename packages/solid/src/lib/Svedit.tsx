import {
	Show,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	onMount,
	useContext
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { CanvasController, check_duplicate_paths } from '@svedit/core';
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
	SveditProps
} from './types.js';

/**
 * The editor component: renders the document root inside a contenteditable
 * canvas. Input, composition, clipboard and selection handling live in the
 * shared `CanvasController` from @svedit/core; this component owns the
 * reactive state (editable, canvas focus, composition) in signals,
 * exposes it through the stable context object, and tells the controller
 * when to render the selection.
 */
export default function Svedit<S extends DocumentSchema>(props: SveditProps<S>) {
	const [local_editable, set_local_editable] = createSignal(false);
	// `editable` is controlled when the prop is passed, otherwise the editor
	// keeps the flag itself (mirrors Svelte's bind:editable / Vue's v-model).
	const editable = () => (props.editable !== undefined ? props.editable : local_editable());

	const [canvas_el, set_canvas_el] = createSignal<HTMLElement | undefined>();
	const [is_composing, set_is_composing] = createSignal(false);
	const [canvas_focused, set_canvas_focused] = createSignal(false);
	const key_mapper = useContext(KeyMapperContext);

	const controller = new CanvasController<S>({
		get session() {
			return props.session;
		},
		get path() {
			return props.path;
		},
		get canvas_el() {
			return canvas_el();
		},
		get editable() {
			return editable();
		},
		get is_composing() {
			return is_composing();
		},
		get canvas_focused() {
			return canvas_focused();
		},
		key_mapper,
		set_is_composing,
		set_canvas_focused
	});

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
			return canvas_el();
		},
		get canvas_focused() {
			return canvas_focused();
		},
		focus_canvas: controller.focus_canvas
	};

	create_node_visibility(context);

	/** Expose function so parent can call it */
	const handle: SveditHandle = { focus_canvas: controller.focus_canvas };
	// Like Solid's element refs, the ref callback is called once on creation.
	// eslint-disable-next-line solid/reactivity
	(props.ref as ((handle: SveditHandle) => void) | undefined)?.(handle);

	onMount(() => {
		check_duplicate_paths(canvas_el());
		onCleanup(controller.listen());
	});

	// Initialize commands and keymap on the session. Runs after mount and
	// re-runs when the session or its config changes.
	createEffect(
		on(
			() => [props.session, props.session.config],
			() => props.session.initialize_commands(context)
		)
	);

	// Render the selection whenever the model selection, the document or the
	// canvas focus changes. Effects run after Solid has updated the DOM.
	createEffect(
		on(
			[() => props.session.selection, () => props.session.doc, canvas_focused],
			() => controller.sync_selection(),
			{ defer: true }
		)
	);

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
				{/* focus and blur are attached natively (on:), and they do not
				    bubble, so only the canvas itself gaining or losing focus counts. */}
				<div
					ref={set_canvas_el}
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
					on:beforeinput={controller.onbeforeinput}
					on:compositionstart={controller.oncompositionstart}
					on:compositionend={controller.oncompositionend}
					on:focus={controller.onfocus}
					on:blur={controller.onblur}
				>
					<Show when={RootComponent()}>
						{(component) => <Dynamic component={component()} path={props.path} />}
					</Show>
				</div>
			</div>
		</SveditContextObject.Provider>
	);
}
