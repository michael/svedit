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

	let nodes = $derived(
		svedit.session
			.get(path)
			.map(/** @param {string} node_id */ (node_id) => svedit.session.get(node_id))
	);

	setContext('node_array_meta', {
		get length() { return nodes.length; }
	});

	/**
	 * Mirror of the AND logic in build_array_gaps_culled. Between-gaps
	 * only activate anchor positioning when BOTH neighbors are near the
	 * viewport; edge gaps only need their single adjacent node. This
	 * keeps NodeGap's `positioned` prop aligned with gap emission so
	 * off-viewport gaps (e.g. scrolled outside an intermediate scroll
	 * container) stay as zero-size static elements.
	 *
	 * Edge gaps additionally consult is_leading_clipped / is_trailing_clipped
	 * so that the selectable NodeGap rect (separate from the marker) also
	 * de-positions itself when its adjacent node is clipped by an
	 * intermediate scroll container.
	 *
	 * @param {number} offset
	 * @returns {boolean}
	 */
	function is_gap_positioned(offset) {
		if (!svedit.is_near_viewport) return true;
		if (offset === 0) {
			if (!svedit.is_near_viewport([...path, 0])) return false;
			if (svedit.is_leading_clipped?.([...path, 0])) return false;
			return true;
		}
		if (offset === nodes.length) {
			if (!svedit.is_near_viewport([...path, nodes.length - 1])) return false;
			if (svedit.is_trailing_clipped?.([...path, nodes.length - 1])) return false;
			return true;
		}
		return svedit.is_near_viewport([...path, offset - 1]) && svedit.is_near_viewport([...path, offset]);
	}
</script>
<!-- we use the anchor of node_array in Overlays.svelte to position the last insertion point in a horizontal layout based on the right edge of the container -->
<svelte:element
	this={tag}
	class={css_class}
	data-type="node_array"
	data-path={path.join('.')}
	style="anchor-name: --{path.join('-')};{style ? ` ${style}` : ''}" {...rest}
>
	{#if nodes.length === 0 && svedit.editable}
		<!--
		Experimental: We'll let .empty-node-array act like a node, so the existing
		code paths for selection mapping will work as expected.

		TODO: Need to figure out a way to make .empty-node-array customizable.
		-->
		<div
			class="node empty-node-array"
			data-path={[...path, 0].join('.')}
			data-type="node"
			style="anchor-name: --{[...path, 0].join(
				'-'
			)}; min-height: 40px; min-width: 24px;"
		></div>
		<!-- Sibling (not child) of .empty-node-array so its .svedit-selectable
		     resolves anchor positioning against the shared containing block,
		     not the placeholder which inherits .node positioning styles. -->
		<NodeGap array_path={path} offset={0} count={0} empty />
	{/if}
	{#each nodes as node, index (index)}
		{#if svedit.editable}
			<NodeGap
				array_path={path}
				offset={index}
				count={nodes.length}
				positioned={is_gap_positioned(index)}
			/>
		{/if}
		{@const Component = svedit.session.config.node_components[snake_to_pascal(node.type)]}
		{#if Component}
			<Component path={[...path, index]} />
		{:else}
			<UnknownNode path={[...path, index]} />
		{/if}
	{/each}
	{#if svedit.editable && nodes.length > 0}
		<NodeGap
			array_path={path}
			offset={nodes.length}
			count={nodes.length}
			positioned={is_gap_positioned(nodes.length)}
		/>
	{/if}
	{#if svedit.editable && NodeGapMarkers}
		<NodeGapMarkers {path} />
	{/if}
</svelte:element>
