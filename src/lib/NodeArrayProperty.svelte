<script>
	import { getContext, setContext } from 'svelte';
	import UnknownNode from './UnknownNode.svelte';
	import { serialize_path, snake_to_pascal } from './utils.js';
	import DefaultNodeGap from './NodeGap.svelte';
	import DefaultNodeGapMarkers from './NodeGapMarkers.svelte';

	/** @import { NodeArrayPropertyProps } from './types.d.ts'; */

	const svedit = getContext('svedit');
	let NodeGap = $derived(svedit.session.config.system_components?.NodeGap ?? DefaultNodeGap);
	let NodeGapMarkers = $derived(svedit.session.config.system_components?.NodeGapMarkers ?? DefaultNodeGapMarkers);

	/** @type {NodeArrayPropertyProps} */
	let { path, tag = 'div', class: css_class, style = '', ...rest } = $props();

	// Pre-joined once per path change; reused by data-path and by every
	// NodeGap's should_position_gap call to avoid N+1 joins per render.
	let path_str = $derived(serialize_path(path));

	let node_ids = $derived(svedit.session.get(path));
	let nodes = $derived(node_ids.map((id) => svedit.session.get(id)));

	// Mirrors the AnnotatedTextProperty pattern: a `focused` class follows
	// the model selection. Used by the CSS rule below to hide the empty-array
	// NodeGap while the caret is in the placeholder, so its <br> isn't a
	// second arrow-key stop (issue #260).
	let is_focused = $derived(
		svedit.session.selection?.type === 'node'
		&& serialize_path(svedit.session.selection.path) === path_str
	);

	setContext('node_array_meta', {
		get length() {
			return node_ids.length;
		}
	});

	// Enforce the "one path = one DOM mount per document" invariant
	$effect(() => {
		const current_path_str = path_str;
		svedit.session.register_mount(current_path_str);
		return () => svedit.session.unregister_mount(current_path_str);
	});
</script>

<!-- we use the anchor of node_array in Overlays.svelte to position the last insertion point in a horizontal layout based on the right edge of the container -->
<svelte:element
	this={tag}
	class={css_class}
	class:focused={is_focused}
	data-type="node_array"
	data-path={path_str}
	style="anchor-name: --{path_str};{style ? ` ${style}` : ''}"
	{...rest}
>
	{#if node_ids.length === 0 && svedit.editable}
		<div
			class="empty-node-placeholder"
			data-path={serialize_path([...path, 0])}
			data-type="node"
			style="anchor-name: --{serialize_path([...path, 0])}; --node-array-anchor: --{path_str}"
		>
		<NodeGap
			array_path={path}
			offset={0}
			count={0}
			empty
			positioned={svedit.editable ? (svedit.should_position_gap?.(path_str, 0, 0) ?? true) : false}
		/>
		</div>
	{/if}
	{#each nodes as node, index (index)}
		<NodeGap
			array_path={path}
			offset={index}
			count={nodes.length}
			positioned={svedit.editable ? (svedit.should_position_gap?.(path_str, index, nodes.length) ?? true) : false}
		/>
		{@const Component = svedit.session.config.node_components[snake_to_pascal(node.type)]}
		{#if Component}
			<Component path={[...path, index]} />
		{:else}
			<UnknownNode path={[...path, index]} />
		{/if}
	{/each}
	{#if node_ids.length > 0}
		<NodeGap
			array_path={path}
			offset={node_ids.length}
			count={node_ids.length}
			positioned={svedit.editable ? (svedit.should_position_gap?.(path_str, node_ids.length, node_ids.length) ?? true) : false}
		/>
	{/if}
	{#if svedit.editable && NodeGapMarkers}
		<NodeGapMarkers {path} />
	{/if}
</svelte:element>
<style>
.empty-node-placeholder {
	cursor: pointer;
	right: anchor(var(--node-array-anchor) right);
	left: anchor(var(--node-array-anchor) left);
	min-height: 40px; 
	min-width: 24px; 
}
</style>