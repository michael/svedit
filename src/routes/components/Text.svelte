<script>
	import { getContext } from 'svelte';
	import Node from '../../lib/Node.svelte';
	import AnnotatedStringProperty from '../../lib/AnnotatedStringProperty.svelte';

	const svedit = getContext('svedit');
	let { path } = $props();
	let node = $derived(svedit.doc.get(path));
	let layout = $derived(node.layout || 1);
	let text_style = $derived(get_text_style_from_layout(layout));

	function get_text_style_from_layout(layout) {
		switch (layout) {
			case 1:
				return 'body';
			case 2:
				return 'heading1';
			case 3:
				return 'heading2';
			case 4:
				return 'heading3';
			default:
				return 'body';
		}
	}
</script>

<Node {path}>
	<div class="text layout-{layout} max-w-screen-lg mx-auto w-full">
	  <AnnotatedStringProperty class={text_style} path={[...path, 'content']} />
	</div>
</Node>

<style>
	.text {
		padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
		padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
		padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
		padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
		padding: var(--s-6);
	}
</style>
