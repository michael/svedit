<script>
  import { getContext } from 'svelte';
	const svedit = getContext('svedit');
	let { path } = $props();
	let node = $derived(svedit.doc.get(path));
</script>

<!-- TEMPORARY HACK: Mark the node as inline node, so selection mapping can consider it as an inline node with a char length of 1 -->
<img data-annotation-type="inline" data-node-id={node.id} src="https://prosemirror.net/img/dino/{node.kind}.png" alt="Tyrannosaurus" />

<style>
	img {
		display: inline-block;
	}
</style>
