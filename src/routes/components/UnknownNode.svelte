<script>
  import Node from '$lib/Node.svelte';
  let { path } = $props();
	let node = $derived(svedit.doc.get(path));
</script>

<Node {path}>
  Unknown node type {node.type}
</Node>
