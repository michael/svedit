<script lang="ts">
	import { getContext, setContext } from 'svelte';
	import { serialize_path } from './utils.js';
	import { is_anchored } from './node_visibility.svelte.js';
	import type {
		NodeArrayAttachmentContext,
		NodeArrayRenderContext,
		NodeProps,
		SveditRenderContext
	} from './types.js';

	const svedit = getContext<SveditRenderContext>('svedit');
	const node_array = getContext<NodeArrayRenderContext | undefined>('node_array_meta');

	let { path, children, tag = 'div', class: css_class, style = '', ...rest }: NodeProps = $props();

	let node = $derived(svedit.session.get(path));
	let path_str = $derived(serialize_path(path));
	let index = $derived(node_array ? (path.at(-1) as number) : -1);
	// Held separately from `anchored`: see get_array_indices
	let near_indices = $derived(
		node_array ? svedit.visibility_registry.get_array_indices(node_array.path_str) : null
	);
	let anchored = $derived(
		is_anchored(svedit.visibility_registry, near_indices, !!node_array?.anchored, index, path_str)
	);
	// The properties of this node carry their anchor names along with it
	setContext('node_anchor', {
		get anchored() {
			return anchored;
		}
	});

	// Marks and annotations covering this node become classes:
	// `mark-<type>`/`anno-<type>`, plus `-start`/`-end` on the first/last
	// covered node, so ranges (including data-only annotations) can be
	// styled with pure CSS. Node components also receive them as props.
	let classes = $derived.by(() => {
		if (!node_array || index < 0) return '';
		let result = index === 0 ? ' first' : '';
		if (index === node_array.length - 1) result += ' last';
		const add = (range: NodeArrayAttachmentContext | null, prefix: string) => {
			const type = range?.node?.type;
			if (!type) return;
			result += ` ${prefix}-${type}`;
			if (range.is_start) result += ` ${prefix}-${type}-start`;
			if (range.is_end) result += ` ${prefix}-${type}-end`;
		};
		add(node_array.mark_for(index), 'mark');
		for (const annotation of node_array.annotations_for(index)) add(annotation, 'anno');
		return result;
	});
</script>

<svelte:element
	this={tag}
	id={node.id}
	class="node-{node.type} {css_class}{classes}"
	data-node-id={node.id}
	data-path={path_str}
	data-type="node"
	style="{anchored ? `anchor-name: --${path_str};` : ''}{style}"
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
