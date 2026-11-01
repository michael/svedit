<script lang="ts">
	import { getContext, setContext, untrack } from 'svelte';
	import UnknownNode from './UnknownNode.svelte';
	import { serialize_path, calculate_fragment_ranges, PATH_SEPARATOR } from './utils.js';
	import DefaultNodeGap from './NodeGap.svelte';
	import DefaultNodeGapMarkers from './NodeGapMarkers.svelte';
	import type {
		NodeArray,
		NodeArrayPropertyProps,
		NodeArrayAttachmentContext,
		Attachment,
		NodeArrayRenderContext,
		SveditRenderContext
	} from './types.js';

	const NO_ANNOTATIONS: NodeArrayAttachmentContext[] = [];
	const svedit = getContext<SveditRenderContext>('svedit');
	const node_anchor = getContext<{ anchored: boolean } | undefined>('node_anchor');
	let NodeGap = $derived(svedit.session.config.system_components?.node_gap ?? DefaultNodeGap);
	let NodeGapMarkers = $derived(
		svedit.session.config.system_components?.node_gap_markers ?? DefaultNodeGapMarkers
	);

	let {
		path,
		tag = 'div',
		class: css_class,
		style = '',
		...rest
	}: NodeArrayPropertyProps = $props();

	let path_str = $derived(serialize_path(path));
	let anchored = $derived(node_anchor?.anchored ?? true);
	let value: NodeArray = $derived(svedit.session.get(path));
	let count = $derived(value.nodes.length);
	// The `focused` class follows a node selection in this array. CSS uses it
	// to hide the empty-array gap's <br>, so it is no second arrow-key stop.
	let is_focused = $derived(svedit.session.selection_at(path)?.type === 'node');
	// Keyed by id and occurrence, so repeated references keep stable keys
	let keys = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Non-reactive local map.
		const occurrences = new Map<string, number>();
		return value.nodes.map((id) => {
			const occurrence = occurrences.get(id) ?? 0;
			occurrences.set(id, occurrence + 1);
			return `${id}:${occurrence}`;
		});
	});
	// Nodes are grouped by the (mutually exclusive) marks wrapping them
	let fragments = $derived(calculate_fragment_ranges(count, value.marks));
	// Every node reads the ranges covering it, so they live in their own
	// state, which changes only along with them, not with every array change
	let marks = $state.raw(untrack(() => value.marks));
	let annotations = $state.raw(untrack(() => value.annotations));
	$effect.pre(() => {
		const { marks: next_marks, annotations: next_annotations } = value;
		untrack(() => {
			if (marks !== next_marks) marks = next_marks;
			if (annotations !== next_annotations) annotations = next_annotations;
		});
	});

	function attachment_context(
		range: Attachment,
		index: number,
		node_index: number
	): NodeArrayAttachmentContext {
		const is_start = node_index === range.start_offset;
		const is_end = node_index === range.end_offset - 1;
		return {
			...range,
			index,
			node: svedit.session.get(range.node_id),
			is_start,
			is_middle: !is_start && !is_end,
			is_end
		};
	}

	function covering(ranges: Attachment[], node_index: number): NodeArrayAttachmentContext[] {
		const result: NodeArrayAttachmentContext[] = [];
		ranges.forEach((range, index) => {
			if (range.start_offset <= node_index && node_index < range.end_offset) {
				result.push(attachment_context(range, index, node_index));
			}
		});
		return result;
	}

	/** The single mark wrapping a node, if any (marks are mutually exclusive). */
	function mark_for(node_index: number): NodeArrayAttachmentContext | null {
		return marks.length ? (covering(marks, node_index)[0] ?? null) : null;
	}

	/** All annotations covering a node. Annotations never wrap nodes. */
	function annotations_for(node_index: number): NodeArrayAttachmentContext[] {
		return annotations.length ? covering(annotations, node_index) : NO_ANNOTATIONS;
	}

	// Lets Node self-serve its position and covering ranges
	setContext<NodeArrayRenderContext>('node_array_meta', {
		get length() {
			return count;
		},
		get path_str() {
			return path_str;
		},
		get anchored() {
			return anchored;
		},
		mark_for,
		annotations_for
	});
</script>

<!-- The node_array anchor positions the last insertion point of horizontal layouts, based on the right edge of the container -->
<svelte:element
	this={tag}
	class={css_class}
	class:focused={is_focused}
	data-type="node_array"
	data-path={path_str}
	style="{anchored ? `anchor-name: --${path_str};` : ''}{style ? ` ${style}` : ''}"
	{...rest}
	{@attach svedit.visibility_registry.track_array(path_str)}
>
	{#if count === 0 && svedit.editable}
		{@const placeholder_path = `${path_str}${PATH_SEPARATOR}0`}
		<div
			class="empty-node-placeholder"
			data-path={placeholder_path}
			data-type="node"
			style="anchor-name: --{placeholder_path};"
			{@attach svedit.visibility_registry.track_node(placeholder_path)}
		>
			<NodeGap array_path={path} offset={0} count={0} empty />
		</div>
	{/if}
	{#snippet render_nodes(start: number, end: number)}
		{#each keys.slice(start, end) as key, slice_index (key)}
			{@const index = start + slice_index}
			{@const node = svedit.session.get(key.slice(0, key.lastIndexOf(':')))}
			{@const Component = svedit.session.config.node_components[node.type]}
			{@const mark = mark_for(index)}
			{@const annotations = annotations_for(index)}
			<NodeGap array_path={path} offset={index} {count} />
			{#if Component}
				<Component path={[...path, index]} {mark} {annotations} />
			{:else}
				<UnknownNode path={[...path, index]} />
			{/if}
		{/each}
	{/snippet}
	{#each fragments as fragment, fragment_index (fragment_index)}
		{@const MarkComponent =
			fragment.type === 'mark'
				? svedit.session.config.node_components[svedit.session.get(fragment.node_id).type]
				: null}
		{#if MarkComponent}
			<!-- The first fragment always starts at 0: its nodes don't depend on the fragment -->
			<MarkComponent path={[...path, 'marks', fragment.mark_index, 'node_id']}>
				{@render render_nodes(fragment_index && fragment.start_offset, fragment.end_offset)}
			</MarkComponent>
		{:else}
			{@render render_nodes(fragment_index && fragment.start_offset, fragment.end_offset)}
		{/if}
	{/each}
	{#if count > 0}
		<NodeGap array_path={path} offset={count} {count} />
	{/if}
	{#if svedit.editable && NodeGapMarkers}
		<NodeGapMarkers {path} {count} />
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
