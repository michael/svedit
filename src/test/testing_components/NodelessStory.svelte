<script>
	import NodeArrayProperty from '../../lib/NodeArrayProperty.svelte';

	let { path } = $props();
</script>

<!-- A node component without a Node: its node array sits right inside the item -->
<NodeArrayProperty class="buttons" path={[...path, 'buttons']} />
