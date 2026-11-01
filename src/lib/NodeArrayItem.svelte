<script lang="ts">
	import { getContext, setContext } from 'svelte';
	import UnknownNode from './UnknownNode.svelte';
	import type {
		DocumentPath,
		NodeArrayAttachmentContext,
		NodeArrayRenderContext,
		NodeItemContext,
		SveditRenderContext
	} from './types.js';

	/**
	 * A node of a node array and the gap before it. The item stays with its
	 * node (keyed by node id and occurrence) while its index shifts, and lets
	 * the node and gap identify it by key (see Node.svelte), so a shift only
	 * updates what carries the index (paths, gap offsets).
	 */
	const NO_ANNOTATIONS: NodeArrayAttachmentContext[] = [];
	const svedit = getContext<SveditRenderContext>('svedit');
	const node_array = getContext<NodeArrayRenderContext>('node_array_meta');
	let {
		key,
		index,
		array_path,
		count
	}: { key: string; index: number; array_path: DocumentPath; count: number } = $props();

	let node = $derived(svedit.session.get(key.slice(0, key.lastIndexOf(':'))));
	let Component = $derived(svedit.session.config.node_components[node.type] ?? UnknownNode);
	let path = $derived([...array_path, index]);
	// Only read the index while ranges exist
	let mark = $derived(node_array.has_ranges ? node_array.mark_for(index) : null);
	let annotations = $derived(
		node_array.has_ranges ? node_array.annotations_for(index) : NO_ANNOTATIONS
	);

	setContext<NodeItemContext>('node_item', {
		get key() {
			return key;
		},
		get node() {
			return node;
		},
		get index() {
			return index;
		},
		get path() {
			return path;
		}
	});
</script>

<node_array.NodeGap {array_path} offset={index} {count} />
<Component {path} {mark} {annotations} />
