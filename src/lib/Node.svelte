<script lang="ts">
	import { getContext, setContext } from 'svelte';
	import { serialize_path, paths_equal } from './utils.js';
	import { FIRST, LAST, SECOND, pin_key } from './node_visibility.svelte.js';
	import { PathTracker } from './stable.svelte.js';
	import type {
		NodeArrayAttachmentContext,
		NodeArrayRenderContext,
		NodeItemContext,
		NodeProps,
		NodeRenderContext,
		SveditRenderContext
	} from './types.js';

	const svedit = getContext<SveditRenderContext>('svedit');
	const node_array = getContext<NodeArrayRenderContext | undefined>('node_array_meta');
	const item = getContext<NodeItemContext | undefined>('node_item');
	// Nodes inside this one are not the item
	setContext('node_item', undefined);

	let { path, children, tag = 'div', class: css_class, style = '', ...rest }: NodeProps = $props();

	// The node array item this node renders (passed its item's path).
	// Everything but the path then follows the item's key and node id, so
	// index shifts only update the path.
	const tracker = new PathTracker(
		() => path,
		() => (item && (item.path === path || paths_equal(item.path, path)) ? item : null)
	);
	let node = $derived(tracker.current ? tracker.current.node : svedit.session.get(path));
	// Outside node arrays nodes always carry their anchor name, else while
	// near the viewport, pinned by the selection, or as one of the first two
	// nodes of an anchored array.
	let anchored = $derived.by(() => {
		const own = tracker.current;
		if (!own) return true;
		const { items, pin_scope } = node_array!;
		return (
			items.near.has(own.key) ||
			svedit.visibility_registry.is_pinned(pin_key(pin_scope, own.key)) ||
			(node_array!.anchored && ((items.ends.get(own.key) ?? 0) & (FIRST | SECOND)) !== 0)
		);
	});
	// Marks the node inside a node selection, whose native highlight is hidden
	let selected = $derived(
		!!tracker.current &&
			svedit.visibility_registry.is_selected(pin_key(node_array!.pin_scope, tracker.current.key))
	);
	// The properties of this node carry their anchor names along with it,
	// and root their paths at it
	setContext<NodeRenderContext>('node_anchor', {
		get anchored() {
			return anchored;
		},
		get id() {
			return node.id;
		},
		get path() {
			return path;
		}
	});

	// Marks and annotations covering this node become classes:
	// `mark-<type>`/`anno-<type>`, plus `-start`/`-end` on the first/last
	// covered node, so ranges (including data-only annotations) can be
	// styled with pure CSS. Node components also receive them as props.
	let classes = $derived.by(() => {
		if (!node_array) return '';
		let result = '';
		const own = tracker.current;
		if (own) {
			const ends = node_array.items.ends.get(own.key) ?? 0;
			if (ends & FIRST) result += ' first';
			if (ends & LAST) result += ' last';
		} else {
			const index = path.at(-1);
			if (index === 0) result += ' first';
			if (index === node_array.length - 1) result += ' last';
		}
		if (!node_array.has_ranges) return result;
		const index = own ? own.index : (path.at(-1) as number);
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
	data-path={tracker.path_str}
	data-type="node"
	data-selected={selected ? '' : undefined}
	style="{anchored ? `anchor-name: --${serialize_path(path)};` : ''}{style}"
	{...rest}
	{@attach (el: HTMLElement) => {
		tracker.el = el;
		const own = tracker.current;
		return svedit.visibility_registry.track_node(
			own && node_array!.items,
			own?.key ?? '',
			own ? pin_key(node_array!.pin_scope, own.key) : undefined
		)(el);
	}}
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
