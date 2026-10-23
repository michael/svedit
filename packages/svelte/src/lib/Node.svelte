<script lang="ts">
	import { getContext } from 'svelte';
	import { get_range_classes, serialize_path } from '@svedit/core';
	import type { NodeArrayRenderContext, NodeProps, SveditRenderContext } from './types.js';

	const svedit = getContext<SveditRenderContext>('svedit');

	let { path, children, tag = 'div', class: css_class, style = '', ...rest }: NodeProps = $props();

	let node = $derived(svedit.session.get(path));
	let path_str = $derived(serialize_path(path));

	const node_array_meta = getContext<NodeArrayRenderContext | undefined>('node_array_meta');
	let child_index = $derived(node_array_meta ? (path.at(-1) as number) : -1);
	let is_first = $derived(node_array_meta && child_index === 0);
	let is_last = $derived(node_array_meta && child_index === node_array_meta.length - 1);

	// Marks and annotations covering this node become `mark-<type>` /
	// `anno-<type>` classes (plus `-start`/`-end` variants), see
	// get_range_classes in @svedit/core.
	let range_classes = $derived(get_range_classes(node_array_meta, child_index));
</script>

<svelte:element
	this={tag}
	id={node.id}
	class="node-{node.type} {css_class}{range_classes ? ` ${range_classes}` : ''}{is_first
		? ' first'
		: ''}{is_last ? ' last' : ''}"
	data-node-id={node.id}
	data-path={path_str}
	data-type="node"
	style="anchor-name: --{path_str};{style}"
	{...rest}
	{@attach svedit.visibility_registry.track_node(path_str)}
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
