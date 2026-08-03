<script lang="ts">
	import { getContext } from 'svelte';
	import { paths_equal, serialize_path } from './utils.js';
	import { create_anchor_gate } from './node_visibility.svelte.js';
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

	let is_selected = $derived(
		svedit.session.selection?.type === 'property' &&
			paths_equal(path, svedit.session.selection.path)
	);
	// The selected property keeps its anchor: the selection overlay targets it.
	const anchor = create_anchor_gate(
		svedit,
		() => path_str,
		'property',
		() => is_selected
	);
</script>

<svelte:element
	this={tag}
	class={css_class}
	data-type="property"
	data-path={path_str}
	style="{anchor.style}{style ? ` ${style}` : ''}"
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
