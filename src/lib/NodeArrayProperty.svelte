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
			style="anchor-name: --{serialize_path([...path, 0])};"
		>
		<NodeGap
			array_path={path}
			offset={0}
			count={0}
			empty
		/>
		</div>
	{/if}
	{#each nodes as node, index (index)}
		<NodeGap
			array_path={path}
			offset={index}
			count={nodes.length}
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
		/>
	{/if}
	{#if svedit.editable && NodeGapMarkers}
		<NodeGapMarkers {path} count={node_ids.length} />
	{/if}
</svelte:element>

<style>
/* position: relative makes this the containing block for the gap's
   .svedit-selectable, which fills it via inset:0. You may override to
   position: absolute (e.g. so an empty array doesn't occupy flow space)
   — still a containing block; then also set position: relative on the
   parent node-array container so this placeholder's inset:0 resolves
   against it. */
	:where(.empty-node-placeholder) {
		position: relative;
		inset: 0;
		min-height: 40px;
		min-width: 24px;
		cursor: pointer;
	}

	/* Reserve room at the scroll edges so the browser's caret-follow scroll
	   (when typing at the end of an overflowing node) can't pin the caret
	   flush against the array's clip edge. Without this padding, scrollLeft
	   stops just short of `scrollWidth - clientWidth - EDGE_TOLERANCE_PX`,
	   leaving `edge_map.last` false; the trailing gap never gains
	   `.positioned`, and the user sees the caret at the edge with no gap to
	   click. The default is 2 × edge-gap (≈ enough for the gap plus a
	   click margin); override per-array via the custom properties. */
	:global([data-type="node_array"]) {
		scroll-padding-inline: var(
			--node-caret-scroll-padding-inline,
			calc(var(--node-caret-edge-gap, 24px) * 2)
		);
		scroll-padding-block: var(
			--node-caret-scroll-padding-block,
			calc(var(--node-caret-edge-gap, 24px) * 2)
		);
	}
</style>