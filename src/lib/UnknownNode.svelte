<script lang="ts">
	import { getContext } from 'svelte';
	import Node from './Node.svelte';
	import type { DocumentPath } from './types.js';

	const svedit = getContext<any>('svedit');
	let { path }: { path: DocumentPath } = $props();
	let node = $derived(svedit.session.get(path));
</script>

<Node {path}>
	Unknown: {node.type}.
</Node>
