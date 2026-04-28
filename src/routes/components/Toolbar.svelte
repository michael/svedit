<script>
	import Icon from './Icon.svelte';
	import {
		get_closest_switchable_layout,
		get_closest_switchable_type
	} from '../app_utils.js';

	let { session, focus_canvas, editable = $bindable(false) } = $props();

	let closest_switchable_layout = $derived(get_closest_switchable_layout(session, session.config));
	let closest_switchable_type = $derived(get_closest_switchable_type(session));

	let input_ref = $state();

	function toggle_editable() {
		if (editable) {
			session.selection = null;
		}
		editable = !editable;
	}

	// Check if we have a collapsed node selection (node caret)
	let is_node_caret = $derived(
		session.selection?.type === 'node' &&
			session.selection.anchor_offset === session.selection.focus_offset
	);

	let is_single_node_selection = $derived(
		session.selection?.type === 'node' &&
			Math.abs(session.selection.focus_offset - session.selection.anchor_offset) === 1
	);

	let can_show_cycle_tools = $derived(
		is_single_node_selection ||
			session.selection?.type === 'text' ||
			session.selection?.type === 'property'
	);
	let can_show_select_parent_tool = $derived(!session.commands.select_parent?.disabled);

	// Get default node_type for current node_array
	let default_node_type = $derived.by(() => {
		if (!is_node_caret) return null;

		const node_array_path = session.selection.path;
		const node_array_node = session.get(node_array_path.slice(0, -1)); // Get the parent node
		const node_array_property = node_array_path.at(-1); // Get the property name

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
	});

	function insert_default_node(event) {
		event.preventDefault();
		if (!is_node_caret || !default_node_type) return;

		const inserter = session.config.inserters?.[default_node_type];
		if (!inserter) return;

		const tr = session.tr;
		inserter(tr);
		session.apply(tr);
	}

	function delete_node_selection(event) {
		event.preventDefault();
		session.apply(session.tr.delete_selection('backward'));
	}

	function cycle_node_type(event) {
		event.preventDefault();
		if (session.commands.next_type?.disabled) return;
		session.commands.next_type?.execute();
	}

	function cycle_layout(event) {
		event.preventDefault();
		if (session.commands.next_layout?.disabled) return;
		session.commands.next_layout?.execute();
	}

	function select_parent(event) {
		event.preventDefault();
		if (session.commands.select_parent?.disabled) return;
		session.commands.select_parent?.execute();
	}

	// Check if we should show the image URL input
	let show_image_input = $derived(
		session.selection?.type === 'property' && session.selection.path.at(-1) === 'image'
	);

	// Check if we should show the link URL input
	let show_link_input = $derived(typeof session.selected_node?.href === 'string');

	// Get current image URL value
	let current_image_url = $derived(show_image_input ? session.get(session.selection.path) : '');

	// Get current link URL value
	let current_link_url = $derived(show_link_input ? session.selected_node?.href : '');

	function update_url() {
		const tr = session.tr;
		if (session.selection.path.at(-1) === 'label') {
			// We are updating the href property of a button
			tr.set([...session.selection.path.slice(0, -1), 'href'], input_ref.value);
		} else {
			// Otherwise it's the image property
			tr.set(session.selection.path, input_ref.value);
		}
		session.apply(tr);
	}

	function handle_toolbar_keydown(event) {
		if (event.key === 'Enter' && input_ref) {
			update_url();
			event.preventDefault();
			event.stopPropagation();
			// Apply the change and return focus to canvas
			focus_canvas();
		} else if (event.key === 'Escape') {
			// Cancel and return focus to canvas without applying changes
			event.preventDefault();
			event.stopPropagation();
			focus_canvas();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor-toolbar" class:editable onkeydown={handle_toolbar_keydown}>
	{#if show_image_input}
		<div class="contextual-input">
			<label>
				Image URL:
				<input
					bind:this={input_ref}
					type="url"
					value={current_image_url}
					placeholder="Enter image URL"
				/>
			</label>
		</div>
	{/if}
	{#if session.selection?.type === 'text'}
		{#if session.available_annotation_types.includes('strong')}
			<button
				title="Bold"
				class="bold"
				onmousedown={(event) => {
					event.preventDefault();
					session.commands.toggle_strong?.execute();
				}}
				disabled={session.commands.toggle_strong?.disabled}
				class:active={session.commands.toggle_strong?.active}
			>
				<Icon name="bold" />
			</button>
		{/if}
		{#if session.available_annotation_types.includes('emphasis')}
			<button
				title="Italic"
				class="italic"
				onmousedown={(event) => {
					event.preventDefault();
					session.commands.toggle_emphasis?.execute();
				}}
				disabled={session.commands.toggle_emphasis?.disabled}
				class:active={session.commands.toggle_emphasis?.active}
			>
				<Icon name="italic" />
			</button>
		{/if}
		{#if session.available_annotation_types.includes('highlight')}
			<button
				title="Highlight"
				class="highlight"
				onmousedown={(event) => {
					event.preventDefault();
					session.commands.toggle_highlight?.execute();
				}}
				disabled={session.commands.toggle_highlight?.disabled}
				class:active={session.commands.toggle_highlight?.active}
			>
				<Icon name="highlight" />
			</button>
		{/if}
		{#if session.available_annotation_types.includes('link')}
			<button
				title="Link"
				onmousedown={(event) => {
					event.preventDefault();
					session.commands.toggle_link?.execute();
				}}
				disabled={session.commands.toggle_link?.disabled}
				class:active={session.commands.toggle_link?.active}
			>
				<Icon name="link" />
			</button>
		{/if}
	{/if}
	{#if show_link_input}
		<div class="contextual-input">
			<label>
				URL:
				<input
					bind:this={input_ref}
					type="url"
					value={current_link_url}
					placeholder="Enter link URL"
				/>
			</label>
		</div>
	{/if}

	{#if session.selection?.type === 'node' || session.selection?.type === 'property'}
		{#if is_node_caret && default_node_type}
			<button title="Insert (↵)" onmousedown={insert_default_node}>
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
		{/if}
		<button title="Delete backwards (⌫)" onmousedown={delete_node_selection}>
			<svg
				class="delete-backwards-icon toolbar-icon"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 15 15"
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M5 3.5H13.5V11.5H5L1.5 7.5L5 3.5Z"
					stroke="currentColor"
					stroke-linejoin="miter"
					stroke-width="0.85"
				/>
				<path
					d="M7.25 6L10.25 9M10.25 6L7.25 9"
					stroke="currentColor"
					stroke-linecap="square"
					stroke-width="0.85"
				/>
			</svg>
		</button>
	{/if}

	{#if can_show_cycle_tools || can_show_select_parent_tool}
		{#if can_show_cycle_tools}
			<button
				title="Cycle type (⌃ ⇧ ↓)"
				onmousedown={cycle_node_type}
				disabled={!closest_switchable_type || session.commands.next_type?.disabled}
			>
				<svg
					class="toolbar-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<line x1="6" y1="4" x2="18" y2="4" />
					<line x1="12" y1="4" x2="12" y2="14" />
					<polyline points="8 18 12 22 16 18" />
					<line x1="12" y1="14" x2="12" y2="22" />
				</svg>
			</button>
			<button
				title="Cycle layout (⌃ ⇧ →)"
				onmousedown={cycle_layout}
				disabled={!closest_switchable_layout || session.commands.next_layout?.disabled}
			>
				<svg
					class="toolbar-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<line x1="4" y1="6" x2="4" y2="18" />
					<line x1="4" y1="12" x2="14" y2="12" />
					<polyline points="18 8 22 12 18 16" />
					<line x1="14" y1="12" x2="22" y2="12" />
				</svg>
			</button>
		{/if}
		{#if can_show_select_parent_tool}
			<button
				title="Select parent (Esc)"
				onmousedown={select_parent}
				disabled={session.commands.select_parent?.disabled}
			>
				<svg
					class="toolbar-icon"
					viewBox="0 0 24 24"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<rect x="3" y="5" width="18" height="14" stroke="currentColor" stroke-width="1.5" />
					<rect x="10.25" y="10.25" width="3.5" height="3.5" fill="currentColor" />
				</svg>
			</button>
		{/if}
	{/if}

	{#if editable}
		<button
			title="Undo"
			onmousedown={(event) => {
				event.preventDefault();
				session.commands.undo?.execute();
			}}
			disabled={session.commands.undo?.disabled}
		>
			<Icon name="rotate-left" />
		</button>
		<button
			title="Redo"
			onmousedown={(event) => {
				event.preventDefault();
				session.commands.redo?.execute();
			}}
			disabled={session.commands.redo?.disabled}
		>
			<Icon name="rotate-right" />
		</button>
	{/if}
	<button class="toggle-editable" onclick={toggle_editable}>
		{editable ? 'Save' : 'Edit'}
	</button>
</div>

<style>
	.toggle-editable {
		font-size: var(--base-size);
		border-radius: var(--s-2);
		font-weight: 700;
		display: block;
		text-decoration: none;
		background: var(--svedit-editing-stroke);
		color: var(--app-canvas-fill);
		padding: var(--s-1) var(--s-8);
	}

	.toggle-editable:hover {
		background: var(--svedit-editing-stroke);
		color: var(--app-canvas-fill);
		opacity: 0.9;
	}

	.editor-toolbar {
		color: var(--app-primary-text);
		background-color: var(--app-canvas-fill);
		width: fit-content;
		position: fixed;
		bottom: var(--s-4);
		right: var(--s-4);
		border-radius: var(--s-2);
		box-shadow: var(--shadow-2);
		display: flex;
		z-index: 50;
		flex-direction: row;
		align-items: center;
		max-width: calc(100vw - 2 * var(--s-4));
		overflow-x: auto;
		scrollbar-width: thin;

		button {
			text-wrap: nowrap;
			height: 100%;
			min-height: 44px;
			--icon-color: var(--app-primary-text);
			position: relative;
			&.active {
				color: var(--svedit-editing-stroke);
				--icon-color: var(--svedit-editing-stroke);
			}
		}

		.toolbar-icon {
			width: var(--icon-size, 20px);
			height: var(--icon-size, 20px);
			color: var(--icon-color, var(--app-primary-text));
		}

		.delete-backwards-icon {
			width: 20px;
			height: 20px;
		}

		.contextual-input {
			display: flex;
			align-items: center;
			gap: var(--s-2);

			label {
				display: flex;
				align-items: center;
				gap: var(--s-1);
				font-size: 14px;
				white-space: nowrap;
			}

			input {
				padding: var(--s-1) var(--s-2);
				border: 1px solid var(--app-stroke);
				border-radius: var(--s-1);
				background: var(--app-canvas-fill);
				color: var(--app-primary-text);
				font-size: 14px;
				width: 200px;

				&:focus {
					outline: none;
					border-color: var(--svedit-editing-stroke);
				}
			}
		}
	}
</style>
