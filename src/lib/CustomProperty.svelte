<script lang="ts">
	import { serialize_path } from './utils.js';
	import type { CustomPropertyProps } from './types.js';

	let { path, tag = 'div', class: css_class, children, style, ...rest }: CustomPropertyProps = $props();
	let path_str = $derived(serialize_path(path));

</script>

<svelte:element
	this={tag}
	class={css_class}
	data-type="property"
	data-path={path_str}
	style="anchor-name: --{path_str};{style ? ` ${style}` : ''}"
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
