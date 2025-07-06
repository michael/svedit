<script>
  import { getContext } from 'svelte';
  import Node from '$lib/Node.svelte';

  const svedit = getContext('svedit');
  let { path } = $props();
	let node = $derived(svedit.doc.get(path));
</script>

<Node {path}>
  Unknown node type {node.type}
</Node>
