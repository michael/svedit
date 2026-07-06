<script>
	import Icon from './Icon.svelte';
	import {
		get_closest_switchable_layout,
		get_closest_switchable_type,
		is_node_subtree_empty
	} from './app_utils.js';

	let { session, focus_canvas, editable = $bindable(false) } = $props();

	let closest_switchable_layout = $derived(get_closest_switchable_layout(session, session.config));
	let closest_switchable_type = $derived(get_closest_switchable_type(session));
	let cycle_node_state = $derived(session.commands.next_type?.cycle_node_state ?? null);
	let should_pulse_cycle_type = $derived(
		!session.commands.next_type?.disabled &&
			cycle_node_state?.node &&
			is_node_subtree_empty(session, cycle_node_state.node)
	);
	let should_pulse_cycle_layout = $derived(
		!session.commands.next_layout?.disabled &&
			closest_switchable_layout?.node &&
			is_node_subtree_empty(session, closest_switchable_layout.node)
	);

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
		if (session.selection.path.at(-1) === 'content') {
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
				<input
					bind:this={input_ref}
					type="url"
					value={current_image_url}
					placeholder="Enter image URL"
				/>
			</label>
		</div>
	{/if}
	{#if session.selection?.type === 'text' || session.selection?.type === 'node'}
		{#if session.available_mark_types.includes('strong')}
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
		{#if session.available_mark_types.includes('emphasis')}
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
		{#if session.available_mark_types.includes('highlight')}
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
		{#if session.available_mark_types.includes('link')}
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
		{#if session.available_mark_types.includes('section')}
			<button
				title="Section (⌘ ⇧ S)"
				onmousedown={(event) => {
					event.preventDefault();
					session.commands.toggle_section?.execute();
				}}
				disabled={session.commands.toggle_section?.disabled}
				class:active={session.commands.toggle_section?.active}
			>
				<svg
					class="toolbar-icon"
					viewBox="0 0 15 15"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<path d="M5 2.5H2.5V12.5H5" stroke="currentColor" />
					<path d="M10 2.5H12.5V12.5H10" stroke="currentColor" />
					<path d="M5.5 5H9.5M5.5 7.5H9.5M5.5 10H9.5" stroke="currentColor" />
				</svg>
			</button>
		{/if}
		{#if session.available_annotation_types.includes('marker')}
			<button
				title="Marker (⌘ ⇧ M)"
				onmousedown={(event) => {
					event.preventDefault();
					session.commands.toggle_marker?.execute();
				}}
				disabled={session.commands.toggle_marker?.disabled}
				class:active={session.commands.toggle_marker?.active}
			>
				<svg
					class="toolbar-icon"
					viewBox="0 0 15 15"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<rect x="2.5" y="4.5" width="10" height="6" rx="2" stroke="currentColor" />
					<rect
						x="4.5"
						y="6.5"
						width="6"
						height="2"
						rx="1"
						fill="currentColor"
						stroke="none"
					/>
				</svg>
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

	{#if can_show_cycle_tools}
		<button
			title="Cycle type (⌃ ⇧ ↓)"
			onmousedown={cycle_node_type}
			disabled={!closest_switchable_type || session.commands.next_type?.disabled}
			class:pulse={should_pulse_cycle_type}
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
			class:pulse={should_pulse_cycle_layout}
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
	{#if editable}
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		height: 36px;
		min-height: 36px;
		padding: 0 1rem;
		border: 1px solid var(--svedit-editing-stroke);
		border-radius: 9999px;
		background: var(--app-canvas-fill);
		color: var(--svedit-editing-stroke);
		box-shadow:
			0 1px 2px oklch(0% 0 0 / 0.22),
			0 2px 4px oklch(0% 0 0 / 0.1);
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1;
		text-decoration: none;
		cursor: pointer;
		pointer-events: auto;
		transition: all 150ms;
		outline: 1px solid transparent;
	}

	.toggle-editable:hover {
		background: color-mix(in oklch, var(--app-primary-text) 4%, var(--app-canvas-fill));
		color: var(--svedit-editing-stroke);
	}

	.toggle-editable:active {
		background: color-mix(in oklch, var(--app-primary-text) 7%, var(--app-canvas-fill));
		transform: translateY(1px) scale(0.95);
	}

	.toggle-editable:focus-visible {
		outline: 1px solid var(--svedit-editing-stroke);
		outline-offset: 1px;
	}

	.editor-toolbar {
		color: var(--app-primary-text);
		width: fit-content;
		position: fixed;
		bottom: var(--s-4);
		right: var(--s-4);
		display: flex;
		z-index: 50;
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		max-width: calc(100vw - 2 * var(--s-4));
		padding: 8px;
		margin: -8px;
		overflow-x: auto;
		scrollbar-width: thin;

		button:not(.toggle-editable) {
			display: flex;
			align-items: center;
			justify-content: center;
			box-sizing: border-box;
			width: 36px;
			height: 36px;
			min-width: 36px;
			min-height: 36px;
			aspect-ratio: 1 / 1;
			padding: 0;
			flex: 0 0 36px;
			border: 1px solid color-mix(in oklch, var(--app-canvas-fill) 91%, var(--app-primary-text));
			border-radius: 50%;
			background: var(--app-canvas-fill);
			color: var(--app-primary-text);
			box-shadow:
				0 1px 2px oklch(0% 0 0 / 0.22),
				0 2px 4px oklch(0% 0 0 / 0.1);
			text-wrap: nowrap;
			cursor: pointer;
			pointer-events: auto;
			transition: all 150ms;
			outline: 1px solid transparent;
			--icon-color: var(--app-primary-text);
			position: relative;
		}

		button:not(.toggle-editable):hover:not(:disabled) {
			border-color: color-mix(in oklch, var(--app-canvas-fill) 88%, var(--app-primary-text));
			background: color-mix(in oklch, var(--app-canvas-fill) 96%, var(--app-primary-text));
		}

		button:not(.toggle-editable):active:not(:disabled) {
			border-color: color-mix(in oklch, var(--app-canvas-fill) 84%, var(--app-primary-text));
			background: color-mix(in oklch, var(--app-canvas-fill) 94%, var(--app-primary-text));
			transform: translateY(1px) scale(0.95);
		}

		button:not(.toggle-editable).pulse::after {
			content: '';
			position: absolute;
			inset: -2px;
			border: 1px solid var(--svedit-editing-stroke);
			border-radius: 9999px;
			opacity: 0;
			animation: pulse-ring 1.6s ease-out infinite;
			pointer-events: none;
		}

		button:not(.toggle-editable):focus-visible {
			outline: 1px solid var(--svedit-editing-stroke);
			outline-offset: 1px;
		}

		button:not(.toggle-editable):disabled {
			color: var(--app-primary-text);
			border-color: color-mix(in oklch, var(--app-canvas-fill) 91%, var(--app-primary-text));
			background: var(--app-canvas-fill);
			box-shadow:
				0 1px 2px oklch(0% 0 0 / 0.22),
				0 2px 4px oklch(0% 0 0 / 0.1);
			opacity: 1;
			cursor: not-allowed;
			--icon-color: color-mix(in oklch, var(--app-canvas-fill) 70%, var(--app-primary-text));
		}

		button:not(.toggle-editable).active {
			color: var(--svedit-editing-stroke);
			border-color: var(--svedit-editing-stroke);
			--icon-color: var(--svedit-editing-stroke);
		}

		.toolbar-icon {
			width: var(--icon-size, 18px);
			height: var(--icon-size, 18px);
			color: var(--icon-color, var(--app-primary-text));
		}

		.delete-backwards-icon {
			width: 18px;
			height: 18px;
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

	@keyframes pulse-ring {
		0% {
			opacity: 0.5;
			transform: scale(1);
		}
		100% {
			opacity: 0;
			transform: scale(1.25);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		button:not(.toggle-editable).pulse::after {
			animation: none;
			opacity: 0;
		}
	}
</style>
