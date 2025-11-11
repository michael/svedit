<script>
	import Icon from './Icon.svelte';
	import { is_selection_collapsed } from 'svedit';

	let { doc, focus_canvas, editable = $bindable(false) } = $props();

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
			doc.selection = null;
		}
		editable = !editable;
	}

	function handle_layout_change(layout_index) {
		if (!doc.layout_node) return;
		if (doc.layout_node.id) {
			const tr = doc.tr;
			tr.set([doc.layout_node.id, 'layout'], layout_index);
			doc.apply(tr);
		}
	}

	function handle_list_layout_change(layout) {
		if (!doc.layout_node) return;
		if (doc.layout_node.id) {
			const tr = doc.tr;
			tr.set([doc.layout_node.id, 'layout'], layout);
			doc.apply(tr);
		}
	}

	function toggle_link() {
		// if the user cancels the prompt it will use the previous link
		const has_link = Boolean(doc.active_annotation('link'));
		const tr = doc.tr;
		if (has_link) {
			// Remove link
			tr.annotate_text('link');
		} else {
			// Create link
			const href = window.prompt('Enter the URL', 'https://example.com');
			if (href) {
				tr.annotate_text('link', { href });
			}
		}
		doc.apply(tr);
	}

	// Check if we have a collapsed node selection (node cursor)
	let is_node_cursor = $derived(
		doc.selection?.type === 'node' && doc.selection.anchor_offset === doc.selection.focus_offset
	);

	// Get allowed node_types for current node_array
	let allowed_node_types = $derived.by(() => {
		if (!is_node_cursor) return [];

		const node_array_path = doc.selection.path;
		const node_array_node = doc.get(node_array_path.slice(0, -1)); // Get the parent node
		const node_array_property = node_array_path.at(-1); // Get the property name

		// Get schema for this node type
		const node_schema = doc.schema[node_array_node?.type];
		if (!node_schema) return [];

		// Get property schema
		const property_definition = node_schema.properties[node_array_property];
		if (property_definition?.type !== 'node_array') return [];

		return property_definition.node_types || [];
	});

	// Function to insert node (always inserts paragraph for now, ignoring node_type)
	function insert_node(node_type) {
		if (!is_node_cursor) return;
		const tr = doc.tr;
		doc.config.inserters[node_type](tr);
		doc.apply(tr);
	}

	// Check if we should show the image URL input
	let show_image_input = $derived(
		doc.selection?.type === 'property' && doc.selection.path.at(-1) === 'image'
	);

	// Check if we should show the link URL input
	let show_link_input = $derived(typeof doc.selected_node?.href === 'string');

	// Get current image URL value
	let current_image_url = $derived(show_image_input ? doc.get(doc.selection.path) : '');

	// Get current link URL value
	let current_link_url = $derived(show_link_input ? doc.selected_node?.href : '');

	function update_url() {
		const tr = doc.tr;
		if (doc.selection.path.at(-1) === 'label') {
			// We are updating the href property of a button
			tr.set([...doc.selection.path.slice(0, -1), 'href'], input_ref.value);
		} else {
			// Otherwise it's the image property
			tr.set(doc.selection.path, input_ref.value);
		}
		doc.apply(tr);
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
	{#if doc.selection?.type === 'text'}
		{#if doc.available_annotation_types.includes('strong')}
			<button
				title="Bold"
				class="bold"
				onclick={() => {
					const tr = doc.tr;
					tr.annotate_text('strong');
					doc.apply(tr);
				}}
				disabled={(doc.active_annotation() && !doc.active_annotation('strong')) ||
					(!doc.active_annotation() && is_selection_collapsed(doc.selection))}
				class:active={doc.active_annotation('strong')}
			>
				<Icon name="bold" />
			</button>
		{/if}
		{#if doc.available_annotation_types.includes('emphasis')}
			<button
				title="Italic"
				class="italic"
				onclick={() => {
					const tr = doc.tr;
					tr.annotate_text('emphasis');
					doc.apply(tr);
				}}
				disabled={(doc.active_annotation() && !doc.active_annotation('emphasis')) ||
					(!doc.active_annotation() && is_selection_collapsed(doc.selection))}
				class:active={doc.active_annotation('emphasis')}
			>
				<Icon name="italic" />
			</button>
		{/if}
		{#if doc.available_annotation_types.includes('highlight')}
			<button
				title="Highlight"
				class="highlight"
				onclick={() => {
					const tr = doc.tr;
					tr.annotate_text('highlight');
					doc.apply(tr);
				}}
				disabled={(doc.active_annotation() && !doc.active_annotation('highlight')) ||
					(!doc.active_annotation() && is_selection_collapsed(doc.selection))}
				class:active={doc.active_annotation('highlight')}
			>
				<Icon name="highlight" />
			</button>
		{/if}
		{#if doc.available_annotation_types.includes('link')}
			<button
				title="Link"
				onclick={toggle_link}
				disabled={doc.commands.toggle_link?.disabled}
				class:active={doc.commands.toggle_link?.active}
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

	{#if doc.layout_node?.type === 'story'}
		{#each layout_options as option (option.value)}
			<button
				onclick={() => handle_layout_change(option.value)}
				class:active={doc.layout_node.layout === option.value}
			>
				<Icon name={option.icon} />
			</button>
		{/each}
	{/if}
	{#if doc.layout_node?.type === 'list'}
		<hr />
		{#each list_layout_options as option (option.value)}
			<button
				onclick={() => handle_list_layout_change(option.value)}
				class:active={doc.layout_node.layout === option.value}
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

	{#if doc.selection?.type === 'text' || (doc.selection?.type === 'node' && doc.selected_node?.type === 'story') || (doc.selection?.type === 'node' && doc.selected_node?.type === 'list')}
		<hr />
	{/if}

	{#if editable}
		<button
			title="Undo"
			onclick={() => {
				console.log('Undo clicked, can_undo:', doc.can_undo, 'history_index:', doc.history_index);
				doc.undo();
			}}
			disabled={!doc.can_undo}
		>
			<Icon name="rotate-left" />
		</button>
		<button
			title="Redo"
			onclick={() => {
				console.log(
					'Redo clicked, can_redo:',
					doc.can_redo,
					'history_index:',
					doc.history_index,
					'history_length:',
					doc.history.length
				);
				doc.redo();
			}}
			disabled={!doc.can_redo}
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
