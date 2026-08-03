<script lang="ts">
	import { getContext } from 'svelte';
	import { serialize_path } from './utils.js';
	import { split_node_path_str } from './node_visibility.svelte.js';
	import type {
		NodeArrayAttachmentContext,
		NodeArrayRenderContext,
		NodeProps,
		SveditRenderContext
	} from './types.js';

	const svedit = getContext<SveditRenderContext>('svedit');

	let { path, children, tag = 'div', class: css_class, style = '', ...rest }: NodeProps = $props();

	let node = $derived(svedit.session.get(path));
	let path_str = $derived(serialize_path(path));

	// Anchor culling. `anchor-name` registers a CSS anchor, and the
	// browser's anchor bookkeeping runs on every layout pass and every
	// native selection update, scaling with the number of registered
	// anchors — at 2000 nodes it is the larger part of the cost of
	// setting the caret after a keystroke. Same design as NodeGap's
	// `.positioned`: while editable, only nodes near the viewport
	// (overscan IO) register their anchor; scrolling moves the window
	// and anchors follow. View mode keeps every anchor, so app overlays
	// that anchor to arbitrary off-screen blocks (e.g. comment layers)
	// see no change. Two-derived split as in NodeGap: get_array_indices
	// lazily creates the set and Svelte doesn't track deps on state
	// created inside the reading derived — acquire here, read in
	// `anchored`.
	let array_split = $derived(split_node_path_str(path_str));
	let near_indices = $derived(
		array_split ? svedit.visibility_registry.get_array_indices(array_split.array_path) : null
	);
	let anchored = $derived(
		!svedit.editable || !array_split || !near_indices || near_indices.has(array_split.index)
	);
	let anchor_style = $derived(anchored ? `anchor-name: --${path_str};` : '');

	const node_array_meta = getContext<NodeArrayRenderContext | undefined>('node_array_meta');
	let child_index = $derived(node_array_meta ? (path.at(-1) as number) : -1);
	let is_first = $derived(node_array_meta && child_index === 0);
	let is_last = $derived(node_array_meta && child_index === node_array_meta.length - 1);

	// Marks and annotations covering this node become classes automatically:
	// `mark-<type>`/`anno-<type>`, plus `-start`/`-end` variants on the run's
	// first/last covered node. This allows styling ranges (including
	// annotations, which never render wrapper components) with pure CSS. For
	// richer rendering, node components still receive the `mark` and
	// `annotations` props.
	let range_classes = $derived.by(() => {
		if (child_index < 0 || !node_array_meta?.annotations_for) return '';
		const classes: string[] = [];

		const add_classes = (range: NodeArrayAttachmentContext | null | undefined, prefix: string) => {
			const range_type = range?.node?.type;
			if (!range_type) return;
			classes.push(`${prefix}-${range_type}`);
			if (range.is_start) classes.push(`${prefix}-${range_type}-start`);
			if (range.is_end) classes.push(`${prefix}-${range_type}-end`);
		};

		add_classes(node_array_meta.mark_for?.(child_index), 'mark');
		for (const annotation of node_array_meta.annotations_for(child_index)) {
			add_classes(annotation, 'anno');
		}
		return classes.join(' ');
	});
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
	style="{anchor_style}{style}"
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
