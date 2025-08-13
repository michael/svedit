<script>
	import { Node, AnnotatedStringProperty } from 'svedit';

	let { path } = $props();
</script>

<Node {path}>
	<div class="paragraph max-w-screen-lg mx-auto w-full">
		<AnnotatedStringProperty class="body" path={[...path, 'content']} />
	</div>
</Node>

<style>
	.paragraph {
		padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
		padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
		padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
		padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
		padding: var(--s-6);
	}
</style>
