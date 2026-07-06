<script>
	import { setContext } from 'svelte';
	import Svedit from '../../lib/Svedit.svelte';
	import { KeyMapper } from '../../lib/index.js';
	import Layout from '../../routes/Layout.svelte';

	let { session } = $props();

	// Mirror the +page.svelte setup so keydown events reach the
	// session keymap. Without this, key_mapper.push_scope() in
	// handle_canvas_focus is a no-op and dispatched Enter goes nowhere.
	const key_mapper = new KeyMapper();
	setContext('key_mapper', key_mapper);
</script>

<Layout>
	<Svedit {session} editable={true} path={[session.doc.document_id]} />
</Layout>

<svelte:window onkeydown={key_mapper.handle_keydown.bind(key_mapper)} />
