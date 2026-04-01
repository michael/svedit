<script>
	import { getContext } from 'svelte';

	/** @import { CustomPropertyProps } from './types.d.ts'; */
	const svedit = getContext('svedit');

	/** @type {CustomPropertyProps} */
	let { path, tag = 'div', class: css_class, children, style, ...rest } = $props();
</script>

<svelte:element
	this={tag}
	class={css_class}
	data-type="property"
	data-path={path.join('.')}
	style="anchor-name: --{path.join('-')};{style ? ` ${style}` : ''}"
	{...rest}
>
	{#if svedit.editable}
		<div class="property-selectable">
			<div class="svedit-selectable"><br /></div>
		</div>
	{/if}

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
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	.svedit-selectable {
		caret-color: transparent;
	}
</style>
