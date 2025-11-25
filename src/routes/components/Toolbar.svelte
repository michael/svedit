<script>
	import Icon from './Icon.svelte';
	import { get_layout_node } from '../app_utils.js';

	let { session, focus_canvas, editable = $bindable(false) } = $props();

	let layout_node = $derived(get_layout_node(session));

	let input_ref = $state();

	const layout_options = [
		{ value: 1, label: 'Image left', icon: 'image-left' },
		{ value: 2, label: 'Image right', icon: 'image-right' },
		{ value: 3, label: 'Image top', icon: 'image-at-top' }
	];

	const list_layout_options = [
		{ value: 1, label: 'Square', icon: 'square' },
		{ value: 2, label: 'Disc', icon: 'disc' },
		{
			value: 3,
			label: 'Decimal leading zero',
			icon: 'list-decimal-leading-zero'
		},
		// { value: 'decimal', label: 'Decimal', icon: 'list-decimal' },
		{ value: 4, label: 'Lower latin', icon: 'list-lower-latin' },
		// { value: 'lower-roman', label: 'Lower roman', icon: 'list-lower-roman' },
		// { value: 'upper-latin', label: 'Upper latin', icon: 'list-upper-latin' },
		{ value: 5, label: 'Upper roman', icon: 'list-upper-roman' }
	];

	function snake_to_human(snake_str) {
		return snake_str
			.split('_')
			.map((word, index) =>
				index === 0
					? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
					: word.toLowerCase()
			)
			.join(' ');
	}

	function toggle_editable() {
		if (editable) {
			session.selection = null;
		}
		editable = !editable;
	}

	function handle_layout_change(layout_index) {
		if (!layout_node) return;
		if (layout_node.id) {
			const tr = session.tr;
			tr.set([layout_node.id, 'layout'], layout_index);
			session.apply(tr);
		}
	}

	function handle_list_layout_change(layout) {
		if (!layout_node) return;
		if (layout_node.id) {
			const tr = session.tr;
			tr.set([layout_node.id, 'layout'], layout);
			session.apply(tr);
		}
	}

	// Check if we have a collapsed node selection (node cursor)
	let is_node_cursor = $derived(
		session.selection?.type === 'node' &&
			session.selection.anchor_offset === session.selection.focus_offset
	);

	// Get allowed node_types for current node_array
	let allowed_node_types = $derived.by(() => {
		if (!is_node_cursor) return [];

		const node_array_path = session.selection.path;
		const node_array_node = session.get(node_array_path.slice(0, -1)); // Get the parent node
		const node_array_property = node_array_path.at(-1); // Get the property name

		// Get schema for this node type
		const node_schema = session.schema[node_array_node?.type];
		if (!node_schema) return [];

		// Get property schema
		const property_definition = node_schema.properties[node_array_property];
		if (property_definition?.type !== 'node_array') return [];

		return property_definition.node_types || [];
	});

	// Function to insert node (always inserts paragraph for now, ignoring node_type)
	function insert_node(node_type) {
		if (!is_node_cursor) return;
		const tr = session.tr;
		session.config.inserters[node_type](tr);
		session.apply(tr);
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
<div class="editor-toolbar p-1" class:editable onkeydown={handle_toolbar_keydown}>
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
		<hr />
	{/if}
	{#if session.selection?.type === 'text'}
		{#if session.available_annotation_types.includes('strong')}
			<button
				title="Bold"
				class="bold"
				onclick={() => session.commands.toggle_strong?.execute()}
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
				onclick={() => session.commands.toggle_emphasis?.execute()}
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
				onclick={() => session.commands.toggle_highlight?.execute()}
				disabled={session.commands.toggle_highlight?.disabled}
				class:active={session.commands.toggle_highlight?.active}
			>
				<Icon name="highlight" />
			</button>
		{/if}
		{#if session.available_annotation_types.includes('link')}
			<button
				title="Link"
				onclick={() => session.commands.toggle_link?.execute()}
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
		<hr />
	{/if}

	{#if layout_node?.type === 'story'}
		{#each layout_options as option (option.value)}
			<button
				onclick={() => handle_layout_change(option.value)}
				class:active={layout_node.layout === option.value}
			>
				<Icon name={option.icon} />
			</button>
		{/each}
	{/if}
	{#if layout_node?.type === 'list'}
		<hr />
		{#each list_layout_options as option (option.value)}
			<button
				onclick={() => handle_list_layout_change(option.value)}
				class:active={layout_node.layout === option.value}
			>
				<Icon name={option.icon} />
			</button>
		{/each}
	{/if}

	{#if is_node_cursor && allowed_node_types.length > 0}
		<hr />
		{#each allowed_node_types as node_type (node_type)}
			<button title={`Add ${snake_to_human(node_type)}`} onclick={() => insert_node(node_type)}>
				<Icon name="square" />
				{snake_to_human(node_type)}
			</button>
		{/each}
	{/if}

	{#if session.selection?.type === 'text' || (session.selection?.type === 'node' && session.selected_node?.type === 'story') || (session.selection?.type === 'node' && session.selected_node?.type === 'list')}
		<hr />
	{/if}

	{#if editable}
		<button
			title="Undo"
			onclick={() => session.commands.undo?.execute()}
			disabled={session.commands.undo?.disabled}
		>
			<Icon name="rotate-left" />
		</button>
		<button
			title="Redo"
			onclick={() => session.commands.redo?.execute()}
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
		background: var(--editing-stroke-color);
		color: var(--canvas-fill-color);
		padding: var(--s-1) var(--s-8);
	}

	.editor-toolbar.editable .toggle-editable {
		margin-left: var(--s-4);
	}

	.toggle-editable:hover {
		background: var(--editing-stroke-color);
		color: var(--canvas-fill-color);
		opacity: 0.9;
	}

	.editor-toolbar {
		color: var(--primary-text-color);
		background-color: var(--canvas-fill-color);
		width: fit-content;
		position: fixed;
		bottom: var(--s-4);
		left: 50%;
		transform: translateX(-50%);
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
			--icon-color: var(--primary-text-color);
			position: relative;
			&.active {
				color: var(--editing-stroke-color);
				--icon-color: var(--editing-stroke-color);
			}
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
				border: 1px solid var(--stroke-color);
				border-radius: var(--s-1);
				background: var(--canvas-fill-color);
				color: var(--primary-text-color);
				font-size: 14px;
				width: 200px;

				&:focus {
					outline: none;
					border-color: var(--editing-stroke-color);
				}
			}
		}

		hr {
			background-color: var(--stroke-color);
			width: 1px;
			height: 100%;
			border: none;
			margin-inline: var(--s-2);
		}
	}
</style>
