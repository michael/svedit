<script>
  import { getContext } from 'svelte';
  import Node from './Node.svelte';

  const svedit = getContext('svedit');
  let { path } = $props();
	let node = $derived(svedit.doc.get(path));
</script>

<Node {path}>
  Unknown: {node.type}.
</Node>
