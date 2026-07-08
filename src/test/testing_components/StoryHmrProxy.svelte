<script>
	import Story from '../../routes/components/Story.svelte';

	/**
	 * Stand-in for the fresh component reference that Vite/Svelte HMR
	 * produces when a node component file is saved in dev mode. Swapping
	 * `session.config.node_components.story` to this wrapper makes Svelte
	 * unmount the old story subtree and mount a new one — recreating all
	 * node and node-gap DOM elements — without any document change.
	 */
	let props = $props();
</script>

<Story {...props} />
