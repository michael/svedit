<script>
	import { Node, TextProperty } from 'svedit';
	import { annotation_classes } from '../annotation_classes.js';

	let { path, annotations = [] } = $props();
</script>

<Node {path} class={annotation_classes(annotations)}>
	<div class="text max-w-screen-lg mx-auto w-full">
		<TextProperty tag="h2" class="heading2" path={[...path, 'content']} placeholder="Heading 2" />
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
