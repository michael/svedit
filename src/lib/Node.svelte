<script>
	import { getContext } from 'svelte';

	/** @import { NodeProps } from './types.d.ts'; */

	const svedit = getContext('svedit');

	/** @type {NodeProps} */
	let { path, children, tag = 'div', class: css_class, style = '', ...rest } = $props();

	let node = $derived(svedit.session.get(path));
</script>

<svelte:element
	id={node.id}
	this={tag}
	class={css_class}
	data-node-id={node.id}
	data-path={path.join('.')}
	data-type="node"
	style="anchor-name: --{path.join('-')};{style}"
	{...rest}
>
	{@render children()}
</svelte:element>

<style>
	[data-type='node'] {
		/** any other position than static will break the anchor positioning of node gaps and node gap-marker */
		/* For developers who need to position their node with `position: absolute` or `position: relative`, they need to wrap their node in a div */
		position: static !important;
	}
</style>