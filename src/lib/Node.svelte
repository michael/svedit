<script>
	import { getContext } from 'svelte';
	import { serialize_path } from './utils.js';

	/** @import { NodeProps } from './types.d.ts'; */

	const svedit = getContext('svedit');

	/** @type {NodeProps} */
	let { path, children, tag = 'div', class: css_class, style = '', ...rest } = $props();

	let node = $derived(svedit.session.get(path));
	let path_str = $derived(serialize_path(path));

	const node_array_meta = getContext('node_array_meta');
	let child_index = $derived(node_array_meta ? parseInt(String(path.at(-1)), 10) : -1);
	let is_first = $derived(node_array_meta && child_index === 0);
	let is_last = $derived(node_array_meta && child_index === node_array_meta.length - 1);

	// Annotations covering this node become classes automatically:
	// `anno-<type>`, plus `anno-<type>-start`/`anno-<type>-end` on the run's
	// first/last covered node. This allows styling annotations (including
	// data-only ones without a component) with pure CSS. For richer
	// rendering, node components still receive the `annotations` prop.
	let annotation_classes = $derived.by(() => {
		if (child_index < 0 || !node_array_meta?.annotations_for) return '';
		const classes = [];
		for (const annotation of node_array_meta.annotations_for(child_index)) {
			const annotation_type = annotation.node?.type;
			if (!annotation_type) continue;
			classes.push(`anno-${annotation_type}`);
			if (annotation.is_start) classes.push(`anno-${annotation_type}-start`);
			if (annotation.is_end) classes.push(`anno-${annotation_type}-end`);
		}
		return classes.join(' ');
	});
</script>

<svelte:element
	this={tag}
	id={node.id}
	class="node-{node.type} {css_class}{annotation_classes
		? ` ${annotation_classes}`
		: ''}{is_first ? ' first' : ''}{is_last ? ' last' : ''}"
	data-node-id={node.id}
	data-path={path_str}
	data-type="node"
	style="anchor-name: --{path_str};{style}"
	{...rest}
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
