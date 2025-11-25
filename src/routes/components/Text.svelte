<script>
	import { getContext } from 'svelte';
	import { Node, AnnotatedTextProperty } from 'svedit';

	const svedit = getContext('svedit');
	let { path } = $props();
	let node = $derived(svedit.editor_state.get(path));
	let layout = $derived(node.layout || 1);
	let tag = $derived(get_tag(layout));
	let text_style = $derived(get_text_style_from_layout(layout));
	let readable_text_type = $derived(get_readable_text_type_from_layout(layout));

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

	function get_tag(layout) {
		switch (layout) {
			case 1:
				return 'p';
			case 2:
				return 'h1';
			case 3:
				return 'h2';
			case 4:
				return 'h3';
			default:
				return 'div';
		}
	}

	function get_readable_text_type_from_layout(layout) {
		switch (layout) {
			case 1:
				return 'Paragraph';
			case 2:
				return 'Heading 1';
			case 3:
				return 'Heading 2';
			case 4:
				return 'Heading 3';
			default:
				return 'Paragraph';
		}
	}
</script>

<Node {path}>
	<div class="text layout-{layout} max-w-screen-lg mx-auto w-full">
		<AnnotatedTextProperty
			{tag}
			class={text_style}
			path={[...path, 'content']}
			placeholder={readable_text_type}
		/>
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
