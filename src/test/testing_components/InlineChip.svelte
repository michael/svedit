<script lang="ts">
	import { getContext } from 'svelte';
	import type { DocumentPath, SveditContext } from '../../lib/types.js';

	const svedit = getContext<SveditContext>('svedit');
	let { path, selected }: { path: DocumentPath; selected: boolean } = $props();
	let node = $derived(svedit.session.get(path));
</script>

<!-- Renders more than one character on purpose: the model holds a single
     placeholder character, so this is what the selection mapping has to
     correct for. -->
<span class="chip" class:selected>@{node.user_id}</span>
