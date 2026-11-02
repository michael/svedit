<script lang="ts">
	import { getContext, setContext, untrack } from 'svelte';
	import NodeArrayItem from './NodeArrayItem.svelte';
	import {
		serialize_path,
		calculate_fragment_ranges,
		paths_equal,
		PATH_SEPARATOR
	} from './utils.js';
	import { root_path } from './doc_utils.js';
	import { Stable } from './stable.svelte.js';
	import { EMPTY_KEY, NodeArrayState, pin_scope_of } from './node_visibility.svelte.js';
	import DefaultNodeGap from './NodeGap.svelte';
	import DefaultNodeGapMarkers from './NodeGapMarkers.svelte';
	import type {
		NodeArray,
		NodeArrayPropertyProps,
		NodeArrayAttachmentContext,
		Attachment,
		NodeArrayRenderContext,
		NodeRenderContext,
		SveditRenderContext
	} from './types.js';

	const NO_ANNOTATIONS: NodeArrayAttachmentContext[] = [];
	const svedit = getContext<SveditRenderContext>('svedit');
	const owner = getContext<NodeRenderContext | undefined>('node_anchor');
	// The trailing and empty-array gaps are no item's, even in a node
	// component without a Node
	setContext('node_item', undefined);
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
	let anchored = $derived(owner?.anchored ?? true);
	// Rooted at the owning node, so index shifts of the owner don't re-read it
	const root = new Stable(() => root_path(path, owner), paths_equal);
	let rooted = $derived(root.current);
	let value: NodeArray = $derived(svedit.session.get(rooted));
	// Identifies the items for pinning, see pin_scope_of. Stable, so the
	// index shifts of the owner don't reach the items.
	const pin_scope = new Stable(() => {
		const pin = owner?.pin;
		const prefix = owner?.path ?? [];
		const owned =
			pin !== undefined &&
			path.length > prefix.length &&
			prefix.every((segment, index) => path[index] === segment);
		return pin_scope_of(
			path,
			(path) => svedit.session.get(path),
			owned ? { pin, path: prefix } : undefined
		);
	});
	let count = $derived(value.nodes.length);
	// The `focused` class follows a node selection in this array. CSS uses it
	// to hide the empty-array gap's <br>, so it is no second arrow-key stop.
	let node_selection = $derived.by(() => {
		const selection = svedit.session.selection_in(rooted.slice(0, -1));
		return selection?.type === 'node' && paths_equal(selection.path, path) ? selection : null;
	});
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
	// Neighbors, ends and visibility of the items, by key
	const items = new NodeArrayState();
	$effect.pre(() => {
		const next_keys = keys;
		untrack(() => items.set_keys(next_keys));
	});
	// Nodes are grouped by the (mutually exclusive) marks wrapping them
	let fragments = $derived(calculate_fragment_ranges(count, value.marks));
	// Every node reads the ranges covering it, so they live in their own
	// state, which changes only along with them, not with every array change
	const marks = new Stable(() => value.marks, ranges_equal);
	const annotations = new Stable(() => value.annotations, ranges_equal);

	// Array changes remap the ranges, which then are new but often equal
	function ranges_equal(a: Attachment[], b: Attachment[]): boolean {
		return (
			a.length === b.length &&
			a.every(
				(range, index) =>
					range.start_offset === b[index].start_offset &&
					range.end_offset === b[index].end_offset &&
					range.node_id === b[index].node_id
			)
		);
	}

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
		return marks.current.length ? (covering(marks.current, node_index)[0] ?? null) : null;
	}

	/** All annotations covering a node. Annotations never wrap nodes. */
	function annotations_for(node_index: number): NodeArrayAttachmentContext[] {
		return annotations.current.length ? covering(annotations.current, node_index) : NO_ANNOTATIONS;
	}

	// Lets items, nodes and gaps self-serve their position and covering ranges
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
		get node_selection() {
			return node_selection;
		},
		get pin_scope() {
			return pin_scope.current;
		},
		// Checked before mark_for and annotations_for, so items only depend on
		// their index while ranges exist
		get has_ranges() {
			return marks.current.length > 0 || annotations.current.length > 0;
		},
		get NodeGap() {
			return NodeGap;
		},
		items,
		mark_for,
		annotations_for
	});
</script>

<!-- The node_array anchor positions the last insertion point of horizontal layouts, based on the right edge of the container -->
<svelte:element
	this={tag}
	class={css_class}
	class:focused={!!node_selection}
	data-type="node_array"
	data-path={path_str}
	style="{anchored ? `anchor-name: --${path_str};` : ''}{style ? ` ${style}` : ''}"
	{...rest}
	{@attach svedit.visibility_registry.track_array(items)}
>
	{#if count === 0 && svedit.editable}
		{@const placeholder_path = `${path_str}${PATH_SEPARATOR}0`}
		<div
			class="empty-node-placeholder"
			data-path={placeholder_path}
			data-type="node"
			style="anchor-name: --{placeholder_path};"
			{@attach svedit.visibility_registry.track_node(items, EMPTY_KEY)}
		>
			<NodeGap array_path={path} offset={0} count={0} empty />
		</div>
	{/if}
	{#snippet render_nodes(start: number, end: number)}
		{#each keys.slice(start, end) as key, slice_index (key)}
			<NodeArrayItem {key} index={start + slice_index} array_path={path} {count} />
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
