<script>
	import { getContext } from 'svelte';
	const svedit = getContext('svedit');
	let { path, content } = $props();
	let node = $derived(svedit.editor_state.get(path));
</script>

<a
	data-node-id={node.id}
	href={node?.href}
	target={node?.target || '_self'}
	style="anchor-name: --{path.join('-')};">{content}</a
>
