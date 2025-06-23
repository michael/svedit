<script>
	import Block from './Block.svelte';
	import Text from './Text.svelte';

	let {
		path,
		/** @type {('decimal'|'decimal-leading-zero'|'lower-roman'|'upper-roman'|'lower-latin'|'upper-latin'|'disc'|'circle'|'square')} */
		list_style
	} = $props();
</script>

<Block {path}>
	<div class="list-item" style="--list-style: {list_style};">
		<Text path={[...path, 'content']} />
	</div>
</Block>

<style>
	.list-item {
		position: relative;
		padding-left: 3em;
	}

	.list-item::before {
		position: absolute;
		left: 0;
		top: 0;
		font-size: 1em;
		content: counter(listcounter, var(--list-style));
		color: var(--primary-fill-color);
	}

	/* CSS Counter initiation */
	:global(.list-item) {
		counter-increment: listcounter;
	}
</style>
