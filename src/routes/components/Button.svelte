<script>
	import { getContext } from 'svelte';
	import { Node, AnnotatedTextProperty } from 'svedit';
	const svedit = getContext('svedit');

	let { path } = $props();
	let node = $derived(svedit.editor_state.get(path));
</script>

<Node {path}>
	<svelte:element
		this={svedit.editable ? 'div' : 'a'}
		href={svedit.editable ? undefined : node.href}
		class="button"
	>
		<AnnotatedTextProperty class="body" path={[...path, 'label']} placeholder="Call to Action" />
	</svelte:element>
</Node>

<style>
	.button {
		display: block;
		text-decoration: none;
		border-radius: var(--s-2);
		background: var(--primary-fill-color);
		color: var(--canvas-fill-color);
		padding: var(--s-2) var(--s-4);
	}

	.button:hover {
		background: var(--primary-fill-color);
		color: var(--canvas-fill-color);
		opacity: 0.8;
	}
</style>
