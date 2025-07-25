<script>
	import { fly } from 'svelte/transition';
	import Icon from './Icon.svelte';
	import { svid } from '../../lib/util.js';
	import { tick } from 'svelte';

	let { doc, focus_canvas } = $props();

	let input_ref = $state();

	const layout_options = [
		{ value: 1, label: 'Image left', icon: 'image-left' },
		{ value: 2, label: 'Image right', icon: 'image-right' },
		{ value: 3, label: 'Image top', icon: 'image-at-top' }
	];

	const list_style_options = [
		{ value: 'square', label: 'Square', icon: 'square' },
		{ value: 'disc', label: 'Disc', icon: 'disc' },
		{
			value: 'decimal-leading-zero',
			label: 'Decimal leading zero',
			icon: 'list-decimal-leading-zero'
		},
		// { value: 'decimal', label: 'Decimal', icon: 'list-decimal' },
		{ value: 'lower-latin', label: 'Lower latin', icon: 'list-lower-latin' },
		// { value: 'lower-roman', label: 'Lower roman', icon: 'list-lower-roman' },
		// { value: 'upper-latin', label: 'Upper latin', icon: 'list-upper-latin' },
		{ value: 'upper-roman', label: 'Upper roman', icon: 'list-upper-roman' }
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

	function handle_layout_change(layout_index) {
		if (!doc.selection || doc.selection.type !== 'node') return;

		const start = Math.min(doc.selection.anchor_offset, doc.selection.focus_offset);
		const node_array = doc.get(doc.selection.path);
		const node_id = node_array[start];

		if (node_id) {
			const tr = doc.tr;
			tr.set([node_id, 'layout'], layout_index);
			doc.apply(tr);
		}
	}

	function handle_list_style_change(list_style) {
		if (!doc.selection || doc.selection.type !== 'node') return;

		const start = Math.min(doc.selection.anchor_offset, doc.selection.focus_offset);
		const node_array = doc.get(doc.selection.path);
		const node_id = node_array[start];

		if (node_id) {
			const tr = doc.tr;
			tr.set([node_id, 'list_style'], list_style);
			doc.apply(tr);
		}
	}

	function insert_link() {
		// if the user cancels the prompt it will use the previous link
		const current_link =
			doc.active_annotation()?.[2] === 'link' ? doc.active_annotation()[3].href : '';

		const new_url = window.prompt('Enter the URL', current_link);

		// Update if the user didn't cancel the prompt
		if (new_url !== null) {
			const tr = doc.tr;
			tr.annotate_text('link', {
				href: new_url // Pass the new_url directly, even if it's an empty string
			});
			doc.apply(tr);
		}
	}

	// Helper function to get the currently selected node
	function get_selected_node() {
		if (!doc.selection) return null;

		if (doc.selection.type === 'node') {
  		const start = Math.min(doc.selection.anchor_offset, doc.selection.focus_offset);
  		const end = Math.max(doc.selection.anchor_offset, doc.selection.focus_offset);
  		// Only consider selection of a single node
  		if (end - start !== 1) return null;
  		const node_array = doc.get(doc.selection.path);
  		const node_id = node_array[start];
  		return node_id ? doc.get(node_id) : null;
		} else {
		  // we are assuming we are either in a text or property (=custom) selection
			const owner_node = doc.get(doc.selection.path.slice(0, -1));
			return owner_node;
		}
		return null;
	}

	// Reactive variable for selected node
	let selected_node = $derived(get_selected_node());

	// Check if we have a collapsed node selection (node cursor)
	let is_node_cursor = $derived(
		doc.selection?.type === 'node' &&
			doc.selection.anchor_offset === doc.selection.focus_offset
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
		const property_schema = node_schema[node_array_property];
		if (property_schema?.type !== 'node_array') return [];

		return property_schema.node_types || [];
	});

	// Function to insert node (always inserts paragraph for now, ignoring node_type)
	function insert_node(node_type) {
		if (!is_node_cursor) return;
		const tr = doc.tr;
		const node_insertion_path = [...doc.selection.path, doc.selection.anchor_offset]
		doc.config.inserters[node_type](tr);
		doc.apply(tr);
	}

	// Check if we should show the image URL input
	let show_image_input = $derived(
		doc.selection?.type === 'property' && doc.selection.path.at(-1) === 'image'
	);

	// Check if we should show the link URL input
	let show_link_input = $derived(
		typeof selected_node?.href === 'string'
	);

	// Get current image URL value
	let current_image_url = $derived(show_image_input ? doc.get(doc.selection.path) : '');

	// Get current link URL value
	let current_link_url = $derived(show_link_input ? selected_node?.href : '');

	function update_image_url() {
		console.log('input_ref.value', input_ref.value);
		const tr = doc.tr;
		tr.set(doc.selection.path, input_ref.value);
		doc.apply(tr);
	}

	function update_button_url() {
		const tr = doc.tr;
		tr.set(doc.selection.path, input_ref.value);
		doc.apply(tr);
	}

	function handle_toolbar_keydown(event) {
		console.log('toolbar keydown', event.key);
		if (event.key === 'Enter' && input_ref) {
			console.log('enter pressed. updating image url');
			update_image_url();
			event.preventDefault();
			event.stopPropagation();
			// Apply the change and return focus to canvas
			focus_canvas();
		} else if (event.key === 'Escape') {
			// console.log('aosdfhsdof');
			// Cancel and return focus to canvas without applying changes
			event.preventDefault();
			event.stopPropagation();
			focus_canvas();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="editor-toolbar p-1"
	in:fly={{ duration: 100, y: 5 }}
	out:fly={{ duration: 100, y: 5 }}
	onkeydown={handle_toolbar_keydown}
>
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
		<button
			title="Bold"
			class="bold"
			onclick={() => {
				const tr = doc.tr;
				tr.annotate_text('strong');
				doc.apply(tr);
			}}
			disabled={doc.active_annotation() && doc.active_annotation()?.[2] !== 'strong'}
			class:active={doc.active_annotation() && doc.active_annotation()?.[2] === 'strong'}
		>
			<Icon name="bold" />
		</button>
		<button
			title="Italic"
			class="italic"
			onclick={() => {
				const tr = doc.tr;
				tr.annotate_text('emphasis');
				doc.apply(tr);
			}}
			disabled={doc.active_annotation() && doc.active_annotation()?.[2] !== 'emphasis'}
			class:active={doc.active_annotation() && doc.active_annotation()?.[2] === 'emphasis'}
		>
			<Icon name="italic" />
		</button>
		<button
			title="Link"
			onclick={insert_link}
			disabled={doc.active_annotation() && doc.active_annotation()?.[2] !== 'link'}
			class:active={doc.active_annotation() && doc.active_annotation()?.[2] === 'link'}
		>
			<Icon name="link" />
		</button>
	{/if}
	{#if show_link_input }
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

	{#if doc.selection?.type === 'node' && selected_node?.type === 'story'}
		{#each layout_options as option}
			<button
				onclick={() => handle_layout_change(option.value)}
				class:active={selected_node.layout === option.value}
			>
				<Icon name={option.icon} />
			</button>
		{/each}
	{/if}
	{#if doc.selection?.type === 'node' && selected_node?.type === 'list'}
		<hr />
		{#each list_style_options as option}
			<button
				onclick={() => handle_list_style_change(option.value)}
				class:active={selected_node.list_style === option.value}
			>
				<Icon name={option.icon} />
			</button>
		{/each}
	{/if}

	{#if is_node_cursor && allowed_node_types.length > 0}
		<hr />
		{#each allowed_node_types as node_type}
			<button title={`Add ${snake_to_human(node_type)}`} onclick={() => insert_node(node_type)}>
				<Icon name="square" />
				{snake_to_human(node_type)}
			</button>
		{/each}
	{/if}

	{#if doc.selection?.type === 'text' || (doc.selection?.type === 'node' && selected_node?.type === 'story') || (doc.selection?.type === 'node' && selected_node?.type === 'list')}
		<hr />
	{/if}
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
</div>

<style>
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
