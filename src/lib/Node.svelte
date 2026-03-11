<script>
	import { getContext } from 'svelte';
	import DefaultNodeGap from './NodeGap.svelte';

	/** @import { NodeProps } from './types.d.ts'; */

	const svedit = getContext('svedit');
	let NodeGap = $derived(svedit.session.config.system_components?.NodeGap ?? DefaultNodeGap);

	/** @type {NodeProps} */
	let { path, children, tag = 'div', class: css_class, style = '', ...rest } = $props();

	let node = $derived(svedit.session.get(path));

	// NodeArrayProperty sets this context — its presence means we're in a node_array.
	// Using context avoids expensive session.inspect() and session.get() calls
	// that would create O(N) reactive subscriptions to the parent array.
	const node_array_meta = getContext('node_array_meta');
	const is_inside_node_array = !!node_array_meta;
	let child_index = $derived(parseInt(String(path.at(-1)), 10));
	let is_first_node_array_child = $derived(is_inside_node_array && child_index === 0);
	let is_last_node_array_child = $derived(
		is_inside_node_array && child_index === node_array_meta.length - 1
	);

	// Drives lazy anchor positioning for node gaps. Gaps are always in the
	// DOM (stable structure for selection), but only anchor-positioned when
	// near the viewport to avoid O(N) layout cost.
	let is_near_viewport = $derived(
		svedit.is_near_viewport?.(path) ?? true
	);
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
	{#if svedit.editable && is_first_node_array_child}
		<NodeGap {path} type="gap-before" positioned={is_near_viewport} />
	{/if}
	{@render children()}
	{#if svedit.editable && is_inside_node_array}
		<NodeGap {path} type="gap-after" last={is_last_node_array_child} positioned={is_near_viewport} />
	{/if}
</svelte:element>

<style>
	[data-type='node'] {
		/** any other position than static will break the anchor positioning of node gaps and node gap-marker */
		/* For developers who need to position their node with `position: absolute` or `position: relative`, they need to wrap their node in a div */
		position: static !important;
	}
</style>