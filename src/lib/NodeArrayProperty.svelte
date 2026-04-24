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

	setContext('node_array_meta', {
		get length() { return node_ids.length; }
	});

	// Enforce the "one path = one DOM mount per document" invariant in dev mode.
	// Logs an error if the same path is mounted twice (e.g. header + footer rendering
	// the same node_array). Multiple legitimate solutions exist: distinct node_arrays
	// in the same doc, or separate Svedit instances.
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
	{#if node_ids.length === 0 && svedit.editable}
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
		<NodeGap
			array_path={path}
			offset={0}
			count={0}
			empty
			positioned={svedit.should_position_gap?.(path_str, 0, 0) ?? true}
		/>
	{/if}
	{#each nodes as node, index (index)}
		{#if svedit.editable}
			<NodeGap
				array_path={path}
				offset={index}
				count={nodes.length}
				positioned={svedit.should_position_gap?.(path_str, index, nodes.length) ?? true}
			/>
		{/if}
		{@const Component = svedit.session.config.node_components[snake_to_pascal(node.type)]}
		{#if Component}
			<Component path={[...path, index]} />
		{:else}
			<UnknownNode path={[...path, index]} />
		{/if}
	{/each}
	{#if svedit.editable && node_ids.length > 0}
		<NodeGap
			array_path={path}
			offset={node_ids.length}
			count={node_ids.length}
			positioned={svedit.should_position_gap?.(path_str, node_ids.length, node_ids.length) ?? true}
		/>
	{/if}
	{#if svedit.editable && NodeGapMarkers}
		<NodeGapMarkers {path} />
	{/if}
</svelte:element>

<style>
	[data-type="node_array"] {
		/*
		 * Defensive isolation for CSS anchor positioning.
		 *
		 * Each NodeArrayProperty publishes per-node anchor-names like `--page-1-body-0`.
		 * Without scoping, anchor() resolves against the nearest matching name in scope,
		 * which can leak across siblings on the same page (multi-document pages, or
		 * accidental duplicate mounts of the same path). `anchor-scope: all` confines
		 * every anchor-name declared inside this subtree to descendants only, so each
		 * NodeArrayProperty's gaps and gap markers always resolve to its own nodes.
		 *
		 * Note: a duplicate mount of the same path within one document is still an error
		 * (see Session#register_mount) — this rule just prevents one symptom (anchor
		 * cross-resolution) from corrupting layout while the dev fixes the root cause.
		 */
		anchor-scope: all;
	}
</style>