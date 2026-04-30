<script>
	import { getContext } from 'svelte';
	import { serialize_path } from '../../lib/utils.js';
	const svedit = getContext('svedit');
	let { path, content } = $props();
	let node = $derived(svedit.session.get(path));
</script>

<a
	id={node.id}
	data-node-id={node.id}
	href={node?.href}
	target={node?.target || '_self'}
	style="anchor-name: --{serialize_path(path)};">{content}</a
>
