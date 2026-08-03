<script lang="ts">
	import { getContext } from 'svelte';
	import { paths_equal, serialize_path } from './utils.js';
	import { split_property_path_str } from './node_visibility.svelte.js';
	import type { CustomPropertyProps, SveditRenderContext } from './types.js';

	const svedit = getContext<SveditRenderContext>('svedit');

	let {
		path,
		tag = 'div',
		class: css_class,
		children,
		style,
		...rest
	}: CustomPropertyProps = $props();
	let path_str = $derived(serialize_path(path));

	// Anchor culling, same design as NodeGap's `.positioned` and Node's
	// `anchored` (see the comment there): while editable, only custom
	// properties whose owning node is near the viewport register their
	// `anchor-name`. A property targeted by the current property
	// selection always keeps its anchor, since the selection overlay
	// (NodeSelectionMarkers) anchors to it. View mode is unchanged.
	// Two-derived split: acquire the set here, read in `anchored`.
	let is_selected = $derived(
		svedit.session.selection?.type === 'property' &&
			paths_equal(path, svedit.session.selection.path)
	);
	let owner_split = $derived(split_property_path_str(path_str));
	let near_indices = $derived(
		owner_split ? svedit.visibility_registry?.get_array_indices(owner_split.array_path) : null
	);
	let anchored = $derived(
		!svedit.editable ||
			is_selected ||
			!owner_split ||
			!near_indices ||
			near_indices.has(owner_split.index)
	);
	let anchor_style = $derived(anchored ? `anchor-name: --${path_str};` : '');
</script>

<svelte:element
	this={tag}
	class={css_class}
	data-type="property"
	data-path={path_str}
	style="{anchor_style}{style ? ` ${style}` : ''}"
	{...rest}
>
	<div class="property-selectable">
		<div class="svedit-selectable"><br /></div>
	</div>

	{@render children()}
</svelte:element>

<style>
	[data-type='property'] {
		position: relative;
	}
	.property-selectable {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 1;
		outline: none;
		/* Position the hidden selectable element at the bottom so the
		   browser's native scroll-to-caret ensures the full property
		   is visible, not just the top edge. */
		display: none;
		align-items: flex-end;
		justify-content: center;
	}
	:global(.svedit.editable) .property-selectable {
		display: flex;
	}
	.svedit-selectable {
		caret-color: transparent;
	}
</style>
