<script lang="ts">
	import { getContext } from 'svelte';
	import Node from './Node.svelte';
	import type { DocumentPath, SveditContext } from './types.js';

	const svedit = getContext<SveditContext>('svedit');
	let { path }: { path: DocumentPath } = $props();
	let node = $derived(svedit.session.get(path));
</script>

<Node {path}>
	Unknown: {node.type}.
</Node>
