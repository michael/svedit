import { Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { serialize_path } from '@svedit/solid';
import Icon from './Icon.js';
import NodeNavigator from './NodeNavigator.js';
import type { AppSession } from '../demo_session.js';
import './Toolbar.css';

type ToolbarProps = {
	session: AppSession;
	focus_canvas: () => void;
	editable: boolean;
	on_editable_change: (editable: boolean) => void;
};

export default function Toolbar(props: ToolbarProps) {
	function toggle_editable() {
		if (props.editable) {
			props.session.selection = null;
		}
		props.on_editable_change(!props.editable);
	}

	const selection_type = createMemo(() => props.session.selection?.type ?? null);

	// Check if we have a collapsed node selection (node caret)
	const is_node_caret = createMemo(() => {
		const selection = props.session.selection;
		return selection?.type === 'node' && selection.anchor_offset === selection.focus_offset;
	});

	// Get default node_type for current node_array
	const default_node_type = createMemo((): string | null => {
		const selection = props.session.selection;
		if (!is_node_caret() || selection?.type !== 'node') return null;

		const node_array_path = selection.path;
		const node_array_node = props.session.get(node_array_path.slice(0, -1)); // Get the parent node
		const node_array_property = node_array_path.at(-1) as string; // Get the property name

		// Get schema for this node type
		const node_schema = props.session.schema[node_array_node?.type];
		if (!node_schema) return null;

		// Get property schema
		const property_definition = node_schema.properties[node_array_property];
		if (property_definition?.type !== 'node_array') return null;

		return (
			property_definition.default_node_type ||
			(property_definition.node_types?.length === 1 ? property_definition.node_types[0] : null)
		);
	});

	const can_insert_default = createMemo(() =>
		Boolean(
			is_node_caret() &&
			default_node_type() &&
			props.session.config.inserters?.[default_node_type()]
		)
	);

	const can_delete = createMemo(
		() => selection_type() === 'node' || selection_type() === 'property'
	);

	function insert_default_node(event: MouseEvent) {
		event.preventDefault();
		const inserter = default_node_type()
			? props.session.config.inserters?.[default_node_type()]
			: null;
		if (!is_node_caret() || !inserter) return;

		const tr = props.session.tr;
		inserter(tr);
		props.session.apply(tr);
	}

	function delete_node_selection(event: MouseEvent) {
		event.preventDefault();
		if (!can_delete()) return;
		props.session.apply(props.session.tr.delete_selection('backward'));
	}

	function select_parent(event: MouseEvent) {
		event.preventDefault();
		if (props.session.commands.select_parent?.disabled) return;
		props.session.commands.select_parent?.execute();
	}

	// While a pointer drags a selection the floating toolbar stays hidden,
	// otherwise it flickers along the growing selection. It appears
	// instantly on pointer up.
	const [is_dragging, set_is_dragging] = createSignal(false);

	function handle_window_pointerdown(event: PointerEvent) {
		// Presses on the toolbars themselves must not hide them
		if (event.target instanceof Element && event.target.closest('.editor-toolbar')) return;
		set_is_dragging(true);
	}

	function handle_window_pointerup() {
		set_is_dragging(false);
	}

	// Check if we should show the image URL input
	const show_image_input = createMemo(() => {
		const selection = props.session.selection;
		return selection?.type === 'property' && selection.path.at(-1) === 'image';
	});

	// Link mark touched by the current text selection. Link marks are edited
	// in the anchored link popover (LinkActionOverlay) which replaces the
	// floating toolbar in that state — same pill, same placement, so the
	// link toggle reads as a morph from toolbar to popover.
	const active_link_mark = createMemo(() =>
		props.session.active_mark?.node.type === 'link' ? props.session.active_mark : null
	);

	// Show the link URL input when a node carrying an href is selected
	// (e.g. a button); link marks are handled by the link popover instead.
	const show_link_input = createMemo(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		() => typeof (props.session.selected_node as any)?.href === 'string'
	);

	// Get current image URL value
	const current_image_url = createMemo((): string =>
		show_image_input() ? props.session.get(props.session.selection.path) : ''
	);

	// Get current link URL value
	const current_link_url = createMemo((): string =>
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		show_link_input() ? ((props.session.selected_node as any)?.href ?? '') : ''
	);

	// NOTE: The URL input is deliberately NOT auto-focused when it appears
	// (e.g. after creating a link or a button): stealing focus from the
	// canvas causes a focus race — clicking back into text re-renders the
	// canvas from its unfocused state, which grabs focus again and the
	// URL editor won't close. Users focus the input explicitly instead.
	// Unchanged values are skipped: the change event fires on blur and also
	// right after an Enter commit, and each edit session should produce
	// exactly one set (single history entry), never a duplicate.
	function update_url(value: string) {
		const session = props.session;
		if (!session.selection) return;
		const tr = session.tr;
		if (session.selection.path.at(-1) === 'content') {
			// We are updating the href property of a button
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			if (value === ((session.selected_node as any)?.href ?? '')) return;
			tr.set([...session.selection.path.slice(0, -1), 'href'], value);
		} else {
			// Otherwise it's the image property
			if (value === session.get(session.selection.path)) return;
			tr.set(session.selection.path, value);
		}
		session.apply(tr);
	}

	function handle_toolbar_keydown(event: KeyboardEvent) {
		// The URL inputs render in both toolbars (floating and bottom), so the
		// value is read from the event target instead of a bound input reference.
		const is_url_input = event.target instanceof HTMLInputElement && event.target.type === 'url';
		if (event.key === 'Enter' && is_url_input) {
			update_url((event.target as HTMLInputElement).value);
			event.preventDefault();
			event.stopPropagation();
			// Apply the change and return focus to canvas
			props.focus_canvas();
		} else if (event.key === 'Escape') {
			// Cancel and return focus to canvas without applying changes. A
			// link that was just created empty is removed again, so Escape
			// cancels the whole link creation.
			if (is_url_input) {
				// Reset the field to the committed value before focus moves
				// back to the canvas, so the change event fired on blur
				// doesn't commit the discarded text.
				const input = event.target as HTMLInputElement;
				input.value =
					input.getAttribute('aria-label') === 'Image URL'
						? current_image_url()
						: current_link_url();
			}
			event.preventDefault();
			event.stopPropagation();
			props.focus_canvas();
		}
	}

	// Anchor for the floating toolbar. Every selectable element exposes
	// anchor-name: --{serialized_path}, so the toolbar attaches to the element
	// owning the current selection with pure CSS anchor positioning.
	// last_node_anchor (multi-node only) is the last selected node's path,
	// exposed as --last-selected-node-anchor for a position-try fallback.
	const floating_anchor = createMemo((): { name: string; last_node_anchor?: string } | null => {
		if (!props.editable) return null;
		const sel = props.session.selection;
		if (!sel) return null;

		if (sel.type === 'text') {
			// No toolbar at a collapsed text caret: it would hover over the
			// line above while the user is typing.
			if (sel.anchor_offset === sel.focus_offset) return null;
			// When the selection touches a link mark, the link popover owns
			// this spot (same pill, same anchor) — the toolbar yields.
			if (active_link_mark()) return null;
			return { name: serialize_path(sel.path) };
		}

		if (sel.type === 'property') {
			return { name: serialize_path(sel.path) };
		}

		if (sel.type === 'node') {
			const start = Math.min(sel.anchor_offset, sel.focus_offset);
			const end = Math.max(sel.anchor_offset, sel.focus_offset);
			if (start !== end) {
				// Anchor to the first selected node. When multiple nodes are
				// selected, last_node_anchor lets CSS fall back to below the
				// last one when above the first overflows.
				return {
					name: serialize_path([...sel.path, start]),
					...(end - start > 1 ? { last_node_anchor: serialize_path([...sel.path, end - 1]) } : {})
				};
			}
			// Node caret: insertion is offered by the in-gap tool
			// (system_components.node_gap_tools → GapInsertTool), which
			// renders inside the active gap marker — not by the floating
			// toolbar.
			return null;
		}

		return null;
	});

	// The floating toolbar is re-created whenever this key changes (see the
	// keyed <Show> below).
	const floating_key = createMemo(() =>
		floating_anchor() && !is_dragging() ? floating_anchor().name : null
	);

	// Distance the visual viewport bottom sits above the layout viewport
	// bottom. Chromium and Firefox resize the layout viewport when the
	// virtual keyboard opens (interactive-widget=resizes-content), so this
	// stays 0 there. iOS Safari only shrinks and pans the visual viewport,
	// so the bottom toolbar must be translated up by this inset to stay
	// visible above the keyboard, also while scrolling.
	const [keyboard_inset, set_keyboard_inset] = createSignal(0);
	let stop_keyboard_tracking: (() => void) | undefined;

	function start_keyboard_tracking() {
		const visual_viewport = window.visualViewport;
		if (!visual_viewport) return;

		let current = keyboard_inset();
		let target = current;
		let raf = 0;

		function measure() {
			target = Math.max(
				0,
				Math.round(window.innerHeight - visual_viewport!.height - visual_viewport!.offsetTop)
			);
			if (!raf) raf = requestAnimationFrame(follow);
		}

		// Exponential follower: large distances (keyboard opening) are covered
		// within a few frames while the small stale-position corrections that
		// Safari reports during touch pans get smoothed instead of rendering
		// as jitter. Speed adapts to the remaining distance by construction.
		function follow() {
			raf = 0;
			const delta = target - current;
			if (Math.abs(delta) <= 1) {
				current = target;
			} else {
				current += delta * 0.35;
				raf = requestAnimationFrame(follow);
			}
			set_keyboard_inset(current);
		}

		measure();
		visual_viewport.addEventListener('resize', measure);
		visual_viewport.addEventListener('scroll', measure);
		stop_keyboard_tracking = () => {
			cancelAnimationFrame(raf);
			visual_viewport.removeEventListener('resize', measure);
			visual_viewport.removeEventListener('scroll', measure);
		};
	}

	onMount(() => {
		window.addEventListener('pointerdown', handle_window_pointerdown);
		window.addEventListener('pointerup', handle_window_pointerup);
		window.addEventListener('pointercancel', handle_window_pointerup);
		start_keyboard_tracking();
	});

	onCleanup(() => {
		window.removeEventListener('pointerdown', handle_window_pointerdown);
		window.removeEventListener('pointerup', handle_window_pointerup);
		window.removeEventListener('pointercancel', handle_window_pointerup);
		stop_keyboard_tracking?.();
	});

	// -------------------------------------------------------------------
	// Reusable toolbar snippets. They are rendered by both the floating and
	// the bottom toolbar, so they are small components closing over this
	// component's state.
	// -------------------------------------------------------------------

	const Divider = () => <span class="divider" aria-hidden="true" />;

	// Way back up the node hierarchy, like Notion's << button in its text
	// formatting toolbar. Repeated presses ascend text -> node -> parent node
	// etc. Hidden entirely at the top level where there is no parent, and
	// pinned to the left edge of a scrollable bar so it stays reachable.
	const SelectParentButton = () => (
		<Show
			when={props.session.commands.select_parent && !props.session.commands.select_parent.disabled}
		>
			<span class="select-parent-group">
				<button title="Select parent (Esc)" onMouseDown={select_parent}>
					<Icon name="escape" />
				</button>
				<Divider />
			</span>
		</Show>
	);

	const CommandButton = (button_props: {
		command_name: string;
		title: string;
		icon: string;
		css_class?: string;
	}) => (
		<Show when={props.session.commands[button_props.command_name]}>
			{(command) => (
				<button
					title={button_props.title}
					class={
						[button_props.css_class, command().active ? 'active' : null]
							.filter(Boolean)
							.join(' ') || undefined
					}
					disabled={command().disabled}
					onMouseDown={(event) => {
						event.preventDefault();
						command().execute();
					}}
				>
					<Icon name={button_props.icon} />
				</button>
			)}
		</Show>
	);

	const MarkButtons = () => (
		<>
			<CommandButton command_name="toggle_strong" title="Bold" icon="bold" css_class="bold" />
			<CommandButton
				command_name="toggle_emphasis"
				title="Italic"
				icon="italic"
				css_class="italic"
			/>
			<CommandButton command_name="toggle_code" title="Code (⌘ ⇧ C)" icon="code" css_class="code" />
			<CommandButton
				command_name="toggle_highlight"
				title="Highlight"
				icon="text-scribble"
				css_class="highlight"
			/>
			<CommandButton command_name="toggle_link" title="Link" icon="link" />
		</>
	);

	// Section marks and markers span whole nodes, so they belong to the node
	// selection tools, not the text tools.
	const NodeMarkButtons = () => (
		<>
			<CommandButton
				command_name="toggle_section"
				title="Section (⌘ ⇧ S)"
				icon="bracket-vertical"
			/>
			<CommandButton command_name="toggle_marker" title="Marker (⌘ ⇧ M)" icon="note-marker" />
		</>
	);

	const InsertButton = () => (
		<button title="Insert (↵)" onMouseDown={insert_default_node} disabled={!can_insert_default()}>
			<svg
				class="toolbar-icon"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 15 15"
				fill="none"
				aria-hidden="true"
			>
				<path d="M7.5 3V12M3 7.5H12" stroke="currentColor" stroke-linecap="square" />
			</svg>
		</button>
	);

	const DeleteButton = () => (
		<button
			title="Delete backwards (⌫)"
			onMouseDown={delete_node_selection}
			disabled={!can_delete()}
		>
			<Icon name="backspace-delete" />
		</button>
	);

	// Rendered unconditionally: commands register only after Svedit has
	// initialized, and the persistent bottom bar must not reflow on first
	// paint when undo/redo appear. Until then the buttons are disabled.
	const HistoryButtons = () => (
		<>
			<button
				title="Undo"
				onMouseDown={(event) => {
					event.preventDefault();
					props.session.commands.undo?.execute();
				}}
				disabled={props.session.commands.undo?.disabled ?? true}
			>
				<Icon name="undo" />
			</button>
			<button
				title="Redo"
				onMouseDown={(event) => {
					event.preventDefault();
					props.session.commands.redo?.execute();
				}}
				disabled={props.session.commands.redo?.disabled ?? true}
			>
				<Icon name="redo" />
			</button>
		</>
	);

	const ContextualInputs = () => (
		<>
			<Show when={show_image_input()}>
				<div class="contextual-input">
					<label>
						<input
							type="url"
							value={current_image_url()}
							placeholder="Enter image URL"
							aria-label="Image URL"
							onChange={(event) => update_url(event.currentTarget.value)}
						/>
					</label>
				</div>
			</Show>
			<Show when={show_link_input()}>
				<div class="contextual-input">
					<label>
						<input
							type="url"
							value={current_link_url()}
							placeholder="Enter link URL"
							aria-label="Link URL"
							onChange={(event) => update_url(event.currentTarget.value)}
						/>
					</label>
				</div>
			</Show>
		</>
	);

	return (
		<>
			{/* Re-mount the toolbar whenever the anchor changes: swapping
			    position-anchor on a persistent fixed element can leave it at the
			    stale position of the previous anchor. */}
			<Show when={floating_key()} keyed>
				{(anchor_name) => (
					<div
						class="editor-toolbar floating-toolbar"
						classList={{ 'has-last-node-anchor': Boolean(floating_anchor()?.last_node_anchor) }}
						style={`position-anchor: --${anchor_name};${
							floating_anchor()?.last_node_anchor
								? ` --last-selected-node-anchor: --${floating_anchor().last_node_anchor};`
								: ''
						}`}
						onKeyDown={handle_toolbar_keydown}
					>
						<div class="toolbar-scroller">
							{/* Only the tools that belong to the current selection context: text
							    selections get text tools, node and property selections the node
							    tools. Node carets are handled by GapInsertTool instead. */}
							<Switch>
								<Match when={selection_type() === 'text'}>
									<SelectParentButton />
									<MarkButtons />
									{/* No divider: the input belongs to the link tool right before it */}
									<Show when={show_link_input()}>
										<ContextualInputs />
									</Show>
								</Match>
								<Match when={selection_type() === 'node'}>
									<SelectParentButton />
									<NodeMarkButtons />
									<NodeNavigator session={props.session} focus_canvas={props.focus_canvas} />
									<Show when={show_link_input()}>
										<Divider />
										<ContextualInputs />
									</Show>
									<DeleteButton />
								</Match>
								<Match when={selection_type() === 'property'}>
									<SelectParentButton />
									<NodeNavigator session={props.session} focus_canvas={props.focus_canvas} />
									<Show when={show_image_input()}>
										<Divider />
										<ContextualInputs />
									</Show>
									<DeleteButton />
								</Match>
							</Switch>
						</div>
					</div>
				)}
			</Show>

			<div
				class="editor-toolbar bottom-toolbar"
				style={{ '--keyboard-inset': `${keyboard_inset()}px` }}
				onKeyDown={handle_toolbar_keydown}
			>
				<div class="toolbar-scroller">
					<Show when={props.editable}>
						{/* Same contextual composition as the floating toolbar: text tools for
						    text selections, just the insert button at node gaps, node tools for
						    node and property selections. */}
						<div class="contextual-tools">
							<Switch>
								<Match when={selection_type() === 'text'}>
									<SelectParentButton />
									<MarkButtons />
									{/* No divider: the input belongs to the link tool right before it */}
									<Show when={show_link_input()}>
										<ContextualInputs />
									</Show>
									<Divider />
								</Match>
								<Match when={is_node_caret()}>
									<Show when={can_insert_default()}>
										<InsertButton />
										<Divider />
									</Show>
								</Match>
								<Match when={selection_type() === 'node'}>
									<SelectParentButton />
									<NodeMarkButtons />
									<NodeNavigator session={props.session} focus_canvas={props.focus_canvas} />
									<Show when={show_link_input()}>
										<Divider />
										<ContextualInputs />
									</Show>
									<Divider />
								</Match>
								<Match when={selection_type() === 'property'}>
									<SelectParentButton />
									<NodeNavigator session={props.session} focus_canvas={props.focus_canvas} />
									<Show when={show_image_input()}>
										<Divider />
										<ContextualInputs />
									</Show>
									<Divider />
								</Match>
							</Switch>
						</div>
						<HistoryButtons />
						{/* Destructive action last, behind undo/redo: harder to hit by
						    accident while scrolling the bar, and undo sits right next to
						    it when it does happen. */}
						<Show when={can_delete()}>
							<div class="contextual-tools">
								<Divider />
								<DeleteButton />
							</div>
						</Show>
					</Show>
					{/* Save pinned to the right edge of the scroller so it never needs
					    scrolling. The custom hide-keyboard tool was removed: the native
					    iOS checkmark in the form assistant bar dismisses the keyboard,
					    and that bar cannot be suppressed from web content anyway. */}
					<div class="save-group" classList={{ 'has-leading-tools': props.editable }}>
						<Show when={props.editable}>
							<Divider />
						</Show>
						<button class="toggle-editable" onClick={toggle_editable}>
							{props.editable ? 'Save' : 'Edit'}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
