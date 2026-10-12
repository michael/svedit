import { useEffect, useState } from 'react';
import { serialize_path, useVersion } from '@svedit/react';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
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

/**
 * Distance the visual viewport bottom sits above the layout viewport
 * bottom. Chromium and Firefox resize the layout viewport when the
 * virtual keyboard opens (interactive-widget=resizes-content), so this
 * stays 0 there. iOS Safari only shrinks and pans the visual viewport,
 * so the bottom toolbar must be translated up by this inset to stay
 * visible above the keyboard, also while scrolling.
 */
function useKeyboardInset(): number {
	const [keyboard_inset, set_keyboard_inset] = useState(0);

	useEffect(() => {
		const visual_viewport = window.visualViewport;
		if (!visual_viewport) return;

		let current = 0;
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
		return () => {
			cancelAnimationFrame(raf);
			visual_viewport.removeEventListener('resize', measure);
			visual_viewport.removeEventListener('scroll', measure);
		};
	}, []);

	return keyboard_inset;
}

export default function Toolbar({
	session,
	focus_canvas,
	editable,
	on_editable_change
}: ToolbarProps) {
	// The toolbar reflects every session change (selection, commands, history).
	useVersion(session);

	function toggle_editable() {
		if (editable) {
			// eslint-disable-next-line react-hooks/immutability -- the session is a mutable store, not a plain prop value
			session.selection = null;
		}
		on_editable_change(!editable);
	}

	const selection = session.selection;
	const selection_type = selection?.type ?? null;

	// Check if we have a collapsed node selection (node caret)
	const is_node_caret =
		selection?.type === 'node' && selection.anchor_offset === selection.focus_offset;

	// Get default node_type for current node_array
	function get_default_node_type(): string | null {
		if (!is_node_caret || selection?.type !== 'node') return null;

		const node_array_path = selection.path;
		const node_array_node = session.get(node_array_path.slice(0, -1)); // Get the parent node
		const node_array_property = node_array_path.at(-1) as string; // Get the property name

		// Get schema for this node type
		const node_schema = session.schema[node_array_node?.type];
		if (!node_schema) return null;

		// Get property schema
		const property_definition = node_schema.properties[node_array_property];
		if (property_definition?.type !== 'node_array') return null;

		return (
			property_definition.default_node_type ||
			(property_definition.node_types?.length === 1 ? property_definition.node_types[0] : null)
		);
	}
	const default_node_type = get_default_node_type();

	const can_insert_default = Boolean(
		is_node_caret && default_node_type && session.config.inserters?.[default_node_type]
	);

	const can_delete = selection_type === 'node' || selection_type === 'property';

	function insert_default_node(event: MouseEvent) {
		event.preventDefault();
		const inserter = default_node_type ? session.config.inserters?.[default_node_type] : null;
		if (!is_node_caret || !inserter) return;

		const tr = session.tr;
		inserter(tr);
		session.apply(tr);
	}

	function delete_node_selection(event: MouseEvent) {
		event.preventDefault();
		if (!can_delete) return;
		session.apply(session.tr.delete_selection('backward'));
	}

	function select_parent(event: MouseEvent) {
		event.preventDefault();
		if (session.commands.select_parent?.disabled) return;
		session.commands.select_parent?.execute();
	}

	// While a pointer drags a selection the floating toolbar stays hidden,
	// otherwise it flickers along the growing selection. It appears
	// instantly on pointer up.
	const [is_dragging, set_is_dragging] = useState(false);

	useEffect(() => {
		function handle_window_pointerdown(event: PointerEvent) {
			// Presses on the toolbars themselves must not hide them
			if (event.target instanceof Element && event.target.closest('.editor-toolbar')) return;
			set_is_dragging(true);
		}
		function handle_window_pointerup() {
			set_is_dragging(false);
		}
		window.addEventListener('pointerdown', handle_window_pointerdown);
		window.addEventListener('pointerup', handle_window_pointerup);
		window.addEventListener('pointercancel', handle_window_pointerup);
		return () => {
			window.removeEventListener('pointerdown', handle_window_pointerdown);
			window.removeEventListener('pointerup', handle_window_pointerup);
			window.removeEventListener('pointercancel', handle_window_pointerup);
		};
	}, []);

	// Check if we should show the image URL input
	const show_image_input = selection?.type === 'property' && selection.path.at(-1) === 'image';

	// Link mark touched by the current text selection. Link marks are edited
	// in the anchored link popover (LinkActionOverlay) which replaces the
	// floating toolbar in that state — same pill, same placement, so the
	// link toggle reads as a morph from toolbar to popover.
	const active_link_mark = session.active_mark?.node.type === 'link' ? session.active_mark : null;

	// Show the link URL input when a node carrying an href is selected
	// (e.g. a button); link marks are handled by the link popover instead.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const show_link_input = typeof (session.selected_node as any)?.href === 'string';

	// Get current image URL value
	const current_image_url: string =
		show_image_input && selection ? session.get(selection.path) : '';

	// Get current link URL value
	const current_link_url: string = show_link_input
		? // eslint-disable-next-line @typescript-eslint/no-explicit-any
			((session.selected_node as any)?.href ?? '')
		: '';

	// NOTE: The URL input is deliberately NOT auto-focused when it appears
	// (e.g. after creating a link or a button): stealing focus from the
	// canvas causes a focus race — clicking back into text re-renders the
	// canvas from its unfocused state, which grabs focus again and the
	// URL editor won't close. Users focus the input explicitly instead.
	// Unchanged values are skipped: the change event fires on blur and also
	// right after an Enter commit, and each edit session should produce
	// exactly one set (single history entry), never a duplicate.
	function update_url(value: string) {
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

	function handle_toolbar_keydown(event: KeyboardEvent<HTMLDivElement>) {
		// The URL inputs render in both toolbars (floating and bottom), so the
		// value is read from the event target instead of a bound input reference.
		const is_url_input = event.target instanceof HTMLInputElement && event.target.type === 'url';
		if (event.key === 'Enter' && is_url_input) {
			update_url((event.target as HTMLInputElement).value);
			event.preventDefault();
			event.stopPropagation();
			// Apply the change and return focus to canvas
			focus_canvas();
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
					input.getAttribute('aria-label') === 'Image URL' ? current_image_url : current_link_url;
			}
			event.preventDefault();
			event.stopPropagation();
			focus_canvas();
		}
	}

	// Anchor for the floating toolbar. Every selectable element exposes
	// anchor-name: --{serialized_path}, so the toolbar attaches to the element
	// owning the current selection with pure CSS anchor positioning.
	// last_node_anchor (multi-node only) is the last selected node's path,
	// exposed as --last-selected-node-anchor for a position-try fallback.
	function get_floating_anchor(): { name: string; last_node_anchor?: string } | null {
		if (!editable) return null;
		const sel = session.selection;
		if (!sel) return null;

		if (sel.type === 'text') {
			// No toolbar at a collapsed text caret: it would hover over the
			// line above while the user is typing.
			if (sel.anchor_offset === sel.focus_offset) return null;
			// When the selection touches a link mark, the link popover owns
			// this spot (same pill, same anchor) — the toolbar yields.
			if (active_link_mark) return null;
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
	}
	const floating_anchor = get_floating_anchor();

	const keyboard_inset = useKeyboardInset();

	// -------------------------------------------------------------------
	// Reusable toolbar snippets. They are rendered by both the floating and
	// the bottom toolbar, so they are plain render functions closing over
	// this component's state.
	// -------------------------------------------------------------------

	const divider = (key?: string) => <span key={key} className="divider" aria-hidden="true" />;

	// Way back up the node hierarchy, like Notion's << button in its text
	// formatting toolbar. Repeated presses ascend text -> node -> parent node
	// etc. Hidden entirely at the top level where there is no parent, and
	// pinned to the left edge of a scrollable bar so it stays reachable.
	const select_parent_button = () => {
		const command = session.commands.select_parent;
		if (!command || command.disabled) return null;
		return (
			<span className="select-parent-group">
				<button title="Select parent (Esc)" onMouseDown={select_parent}>
					<Icon name="escape" />
				</button>
				{divider()}
			</span>
		);
	};

	function command_button(
		command_name: string,
		title: string,
		icon: string,
		css_class?: string
	): ReactNode {
		const command = session.commands[command_name];
		if (!command) return null;
		return (
			<button
				key={command_name}
				title={title}
				className={
					[css_class, command.active ? 'active' : null].filter(Boolean).join(' ') || undefined
				}
				disabled={command.disabled}
				onMouseDown={(event: MouseEvent) => {
					event.preventDefault();
					command.execute();
				}}
			>
				<Icon name={icon} />
			</button>
		);
	}

	const mark_buttons = () => (
		<>
			{command_button('toggle_strong', 'Bold', 'bold', 'bold')}
			{command_button('toggle_emphasis', 'Italic', 'italic', 'italic')}
			{command_button('toggle_code', 'Code (⌘ ⇧ C)', 'code', 'code')}
			{command_button('toggle_highlight', 'Highlight', 'text-scribble', 'highlight')}
			{command_button('toggle_link', 'Link', 'link')}
		</>
	);

	// Section marks and markers span whole nodes, so they belong to the node
	// selection tools, not the text tools.
	const node_mark_buttons = () => (
		<>
			{command_button('toggle_section', 'Section (⌘ ⇧ S)', 'bracket-vertical')}
			{command_button('toggle_marker', 'Marker (⌘ ⇧ M)', 'note-marker')}
		</>
	);

	const insert_button = () => (
		<button title="Insert (↵)" onMouseDown={insert_default_node} disabled={!can_insert_default}>
			<svg
				className="toolbar-icon"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 15 15"
				fill="none"
				aria-hidden="true"
			>
				<path d="M7.5 3V12M3 7.5H12" stroke="currentColor" strokeLinecap="square" />
			</svg>
		</button>
	);

	const delete_button = () => (
		<button title="Delete backwards (⌫)" onMouseDown={delete_node_selection} disabled={!can_delete}>
			<Icon name="backspace-delete" />
		</button>
	);

	// Rendered unconditionally: commands register only after Svedit has
	// initialized, and the persistent bottom bar must not reflow on first
	// paint when undo/redo appear. Until then the buttons are disabled.
	const history_buttons = () => (
		<>
			<button
				title="Undo"
				onMouseDown={(event: MouseEvent) => {
					event.preventDefault();
					session.commands.undo?.execute();
				}}
				disabled={session.commands.undo?.disabled ?? true}
			>
				<Icon name="undo" />
			</button>
			<button
				title="Redo"
				onMouseDown={(event: MouseEvent) => {
					event.preventDefault();
					session.commands.redo?.execute();
				}}
				disabled={session.commands.redo?.disabled ?? true}
			>
				<Icon name="redo" />
			</button>
		</>
	);

	// The inputs are uncontrolled and keyed by their committed value, so a
	// commit re-mounts them with the new value while typing never fights
	// with React's controlled-input reconciliation.
	const contextual_inputs = () => (
		<>
			{show_image_input && (
				<div className="contextual-input">
					<label>
						<input
							key={current_image_url}
							type="url"
							defaultValue={current_image_url}
							placeholder="Enter image URL"
							aria-label="Image URL"
							onBlur={(event) => update_url(event.currentTarget.value)}
						/>
					</label>
				</div>
			)}
			{show_link_input && (
				<div className="contextual-input">
					<label>
						<input
							key={current_link_url}
							type="url"
							defaultValue={current_link_url}
							placeholder="Enter link URL"
							aria-label="Link URL"
							onBlur={(event) => update_url(event.currentTarget.value)}
						/>
					</label>
				</div>
			)}
		</>
	);

	const floating_style = floating_anchor
		? ({
				positionAnchor: `--${floating_anchor.name}`,
				...(floating_anchor.last_node_anchor
					? { '--last-selected-node-anchor': `--${floating_anchor.last_node_anchor}` }
					: {})
			} as CSSProperties)
		: undefined;

	return (
		<>
			{/* Re-mount the toolbar whenever the anchor changes: swapping
			    position-anchor on a persistent fixed element can leave it at the
			    stale position of the previous anchor. */}
			{floating_anchor && !is_dragging && (
				<div
					key={floating_anchor.name}
					className={`editor-toolbar floating-toolbar${
						floating_anchor.last_node_anchor ? ' has-last-node-anchor' : ''
					}`}
					style={floating_style}
					onKeyDown={handle_toolbar_keydown}
				>
					<div className="toolbar-scroller">
						{/* Only the tools that belong to the current selection context: text
						    selections get text tools, node and property selections the node
						    tools. Node carets are handled by GapInsertTool instead. */}
						{selection_type === 'text' ? (
							<>
								{select_parent_button()}
								{mark_buttons()}
								{/* No divider: the input belongs to the link tool right before it */}
								{show_link_input && contextual_inputs()}
							</>
						) : selection_type === 'node' ? (
							<>
								{select_parent_button()}
								{node_mark_buttons()}
								<NodeNavigator session={session} focus_canvas={focus_canvas} />
								{show_link_input && (
									<>
										{divider()}
										{contextual_inputs()}
									</>
								)}
								{delete_button()}
							</>
						) : selection_type === 'property' ? (
							<>
								{select_parent_button()}
								<NodeNavigator session={session} focus_canvas={focus_canvas} />
								{show_image_input && (
									<>
										{divider()}
										{contextual_inputs()}
									</>
								)}
								{delete_button()}
							</>
						) : null}
					</div>
				</div>
			)}

			<div
				className="editor-toolbar bottom-toolbar"
				style={{ '--keyboard-inset': `${keyboard_inset}px` } as CSSProperties}
				onKeyDown={handle_toolbar_keydown}
			>
				<div className="toolbar-scroller">
					{editable && (
						<>
							{/* Same contextual composition as the floating toolbar: text tools for
							    text selections, just the insert button at node gaps, node tools for
							    node and property selections. */}
							<div className="contextual-tools">
								{selection_type === 'text' ? (
									<>
										{select_parent_button()}
										{mark_buttons()}
										{/* No divider: the input belongs to the link tool right before it */}
										{show_link_input && contextual_inputs()}
										{divider()}
									</>
								) : is_node_caret ? (
									can_insert_default && (
										<>
											{insert_button()}
											{divider()}
										</>
									)
								) : selection_type === 'node' ? (
									<>
										{select_parent_button()}
										{node_mark_buttons()}
										<NodeNavigator session={session} focus_canvas={focus_canvas} />
										{show_link_input && (
											<>
												{divider()}
												{contextual_inputs()}
											</>
										)}
										{divider()}
									</>
								) : selection_type === 'property' ? (
									<>
										{select_parent_button()}
										<NodeNavigator session={session} focus_canvas={focus_canvas} />
										{show_image_input && (
											<>
												{divider()}
												{contextual_inputs()}
											</>
										)}
										{divider()}
									</>
								) : null}
							</div>
							{history_buttons()}
							{/* Destructive action last, behind undo/redo: harder to hit by
							    accident while scrolling the bar, and undo sits right next to
							    it when it does happen. */}
							{can_delete && (
								<div className="contextual-tools">
									{divider()}
									{delete_button()}
								</div>
							)}
						</>
					)}
					{/* Save pinned to the right edge of the scroller so it never needs
					    scrolling. The custom hide-keyboard tool was removed: the native
					    iOS checkmark in the form assistant bar dismisses the keyboard,
					    and that bar cannot be suppressed from web content anyway. */}
					<div className={`save-group${editable ? ' has-leading-tools' : ''}`}>
						{editable && divider()}
						<button className="toggle-editable" onClick={toggle_editable}>
							{editable ? 'Save' : 'Edit'}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
