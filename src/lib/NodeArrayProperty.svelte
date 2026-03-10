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

	// Expose array metadata to child Node.svelte instances via context,
	// avoiding expensive session.inspect() / session.get() calls per node.
	setContext('node_array_meta', {
		get length() { return nodes.length; }
	});
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
		<NodeGap path={[...path, 0]} type="gap-before" empty />
	{/if}
	{#each nodes as node, index (index)}
		{@const Component = svedit.session.config.node_components[snake_to_pascal(node.type)]}
		{#if Component}
			<Component path={[...path, index]} />
		{:else}
			<UnknownNode path={[...path, index]} />
		{/if}
	{/each}
	{#if svedit.editable && NodeGapMarkers}
		<NodeGapMarkers {path} />
	{/if}
</svelte:element>
