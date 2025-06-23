<script>
	import { getContext } from 'svelte';
	import Block from '$lib/Block.svelte';
	import Text from '$lib/Text.svelte';

	const svedit = getContext('svedit');

	let { path } = $props();
	let block = $derived(svedit.doc.get(path));
</script>

<Block {path}>
	<div class="paragraph-block max-w-screen-lg mx-auto w-full">
		<Text class="body" path={[...path, 'content']} editable={block.editable} />
	</div>
</Block>

<style>
	.paragraph-block {
		padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
		padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
		padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
		padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
		padding: var(--s-6);
	}
</style>
