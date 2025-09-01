<script>
	import { getContext } from 'svelte';
	import { Node, AnnotatedStringProperty } from 'svedit';

	const svedit = getContext('svedit');
	let { path } = $props();
	let node = $derived(svedit.doc.get(path));
	let layout = $derived(node.layout || 1);
	let is_empty = $derived(!node.content?.[0]);
	let text_style = $derived(get_text_style_from_layout(layout));
	let readable_text_type = $derived(get_readable_text_type_from_layout(layout));
	let is_selected = $derived(is_text_node_selected());

	function is_text_node_selected() {
		const sub_path_of_selection = svedit?.doc?.selection?.path?.slice(0, path.length).join('.');
		const _path = path.join('.');
		return (sub_path_of_selection === _path);
	}

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
	  <AnnotatedStringProperty class={text_style} path={[...path, 'content']} placeholder={readable_text_type} />
		{#if is_empty && is_selected && !svedit.is_composing}
		  <span contenteditable="false" class="shortcuts caption">⌃⌥↓ next type ⌃⌥→ next layout</span>
		{/if}
	</div>
</Node>

<style>
	.text {
		padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
		padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
		padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
		padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
		padding: var(--s-6);
		position: relative;
	}

	.shortcuts {
	  position: absolute;
		right: 28px;
		top: 28px;
		color: color-mix(in oklch, currentcolor 50%, transparent);
		pointer-events: none;
	}
</style>
