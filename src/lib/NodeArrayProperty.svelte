<script>
	import { getContext, setContext } from 'svelte';
	import UnknownNode from './UnknownNode.svelte';
	import { snake_to_pascal } from './utils.js';
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
	let path_str = $derived(path.join('.'));

	let node_ids = $derived(svedit.session.get(path));
	let nodes = $derived(node_ids.map(id => svedit.session.get(id)));

	// Empty arrays render both an .empty-node-placeholder (cursor target) and
	// a NodeGap (wide click hit area). Hide the gap while the caret is in the
	// placeholder so its <br> isn't a second arrow-key stop (issue #260).
	let cursor_in_empty_placeholder = $derived(
		node_ids.length === 0
		&& svedit.session.selection?.type === 'node'
		&& svedit.session.selection.path.join('.') === path_str
	);

	setContext('node_array_meta', {
		get length() { return node_ids.length; }
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
	data-type="node_array"
	data-path={path_str}
	style="anchor-name: --{path.join('-')};{style ? ` ${style}` : ''}" {...rest}
>
	{#if node_ids.length === 0}
		<!--
		Experimental: We'll let .empty-node-placeholder act like a node, so the existing
		code paths for selection mapping will work as expected.

		TODO: Need to figure out a way to make .empty-node-placeholder customizable.
		-->
		{#if svedit.editable}
			<div
				class="empty-node-placeholder"
				class:cursor-here={cursor_in_empty_placeholder}
				data-path={[...path, 0].join('.')}
				data-type="node"
				style="anchor-name: --{[...path, 0].join(
					'-'
				)}; min-height: 40px; min-width: 24px;"
			><br /></div>
			<!-- Sibling (not child) of .empty-node-placeholder so its .svedit-selectable
			     resolves anchor positioning against the shared containing block,
			     not the placeholder which inherits .node positioning styles. -->
		{/if}
		<NodeGap
			array_path={path}
			offset={0}
			count={0}
			empty
			positioned={svedit.editable ? (svedit.should_position_gap?.(path_str, 0, 0) ?? true) : false}
		/>
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
	/* See `cursor_in_empty_placeholder` derived state (issue #260). */
	:global(.empty-node-placeholder.cursor-here + .node-gap) {
		display: none;
	}
</style>