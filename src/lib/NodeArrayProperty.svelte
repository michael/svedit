<script>
	import { getContext, setContext } from 'svelte';
	import UnknownNode from './UnknownNode.svelte';
	import { serialize_path, calculate_fragment_ranges } from './utils.js';
	import DefaultNodeGap from './NodeGap.svelte';
	import DefaultNodeGapMarkers from './NodeGapMarkers.svelte';

	/** @import { NodeArrayPropertyProps, NodeArrayAnnotationContext } from './types.d.ts'; */

	const svedit = getContext('svedit');
	let NodeGap = $derived(svedit.session.config.system_components?.node_gap ?? DefaultNodeGap);
	let NodeGapMarkers = $derived(
		svedit.session.config.system_components?.node_gap_markers ?? DefaultNodeGapMarkers
	);

	/** @type {NodeArrayPropertyProps} */
	let { path, tag = 'div', class: css_class, style = '', ...rest } = $props();

	// Pre-joined once per path change; reused by data-path and by every
	// NodeGap's should_position_gap call to avoid N+1 joins per render.
	let path_str = $derived(serialize_path(path));

	let raw_value = $derived(svedit.session.get(path));
	let node_ids = $derived(raw_value.nodes);
	let annotations = $derived(raw_value.annotations);

	let in_place_annotations = $derived(get_in_place_annotations(annotations));
	let fragments = $derived(get_fragments(node_ids, in_place_annotations));

	function get_fragments(node_ids, annotations) {
		const ranges = calculate_fragment_ranges(node_ids.length, annotations);
		let fragments = [];

		for (const range of ranges) {
			const nodes_slice = node_ids.slice(range.start_offset, range.end_offset);

			if (range.type === 'annotation') {
				const node = svedit.session.get(range.node_id);
				fragments.push({
					type: 'annotation',
					node,
					nodes: nodes_slice,
					start_index: range.start_offset,
					annotation_index: range.annotation_index
				});
			} else if (range.type === 'content') {
				fragments.push({
					type: 'nodes',
					nodes: nodes_slice,
					start_index: range.start_offset
				});
			}
		}
		return fragments;
	}

	function get_in_place_annotations(annotations) {
		return annotations
			.map((annotation, index) => ({ ...annotation, annotation_index: index }))
			.filter((annotation) => {
				const node = svedit.session.get(annotation.node_id);
				return node && svedit.session.config.node_components[node.type];
			});
	}

	function get_node_key(node_id, index) {
		let occurrence = 0;
		for (let current_index = 0; current_index < index; current_index++) {
			if (node_ids[current_index] === node_id) occurrence += 1;
		}
		return `${node_id}:${occurrence}`;
	}

	/**
	 * @returns {NodeArrayAnnotationContext}
	 */
	function get_annotation_context(annotation, index, node_index) {
		const node = svedit.session.get(annotation.node_id);
		const is_start = node_index === annotation.start_offset;
		const is_end = node_index === annotation.end_offset - 1;

		return {
			...annotation,
			index,
			node,
			is_start,
			is_middle: !is_start && !is_end,
			is_end
		};
	}

	function get_annotations(node_index) {
		return annotations
			.map((annotation, index) => ({ annotation, index }))
			.filter(
				({ annotation }) =>
					annotation.start_offset <= node_index && node_index < annotation.end_offset
			)
			.map(({ annotation, index }) => get_annotation_context(annotation, index, node_index));
	}

	function get_annotation(node_index) {
		const annotations = get_annotations(node_index);

		return annotations.length === 1 ? annotations[0] : null;
	}

	// Mirrors the TextProperty pattern: a `focused` class follows
	// the model selection. Used by the CSS rule below to hide the empty-array
	// NodeGap while the caret is in the placeholder, so its <br> isn't a
	// second arrow-key stop (issue #260).
	let is_focused = $derived(
		svedit.session.selection?.type === 'node' &&
			serialize_path(svedit.session.selection.path) === path_str
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
			<NodeGap array_path={path} offset={0} count={0} empty />
		</div>
	{/if}
	{#snippet render_nodes(nodes_slice, start_index)}
		{#each nodes_slice as id, slice_index (get_node_key(id, start_index + slice_index))}
			{@const index = start_index + slice_index}
			{@const node = svedit.session.get(id)}
			{@const annotation = get_annotation(index)}
			{@const annotations = get_annotations(index)}
			<NodeGap array_path={path} offset={index} count={node_ids.length} />
			{@const Component = svedit.session.config.node_components[node.type]}
			{#if Component}
				<Component path={[...path, index]} {annotation} {annotations} />
			{:else}
				<UnknownNode path={[...path, index]} />
			{/if}
		{/each}
	{/snippet}

	{#each fragments as fragment, fragment_index (fragment_index)}
		{#if fragment.type === 'nodes'}
			{@render render_nodes(fragment.nodes, fragment.start_index)}
		{:else if fragment.type === 'annotation'}
			{@const AnnotationComponent = svedit.session.config.node_components[fragment.node.type]}
			{#if AnnotationComponent}
				<AnnotationComponent path={[...path, 'annotations', fragment.annotation_index, 'node_id']}>
					{@render render_nodes(fragment.nodes, fragment.start_index)}
				</AnnotationComponent>
			{:else}
				{@render render_nodes(fragment.nodes, fragment.start_index)}
			{/if}
		{/if}
	{/each}
	{#if node_ids.length > 0}
		<NodeGap array_path={path} offset={node_ids.length} count={node_ids.length} />
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
</style>
