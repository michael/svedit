<script lang="ts">
	import { setContext, untrack } from 'svelte';
	import Svedit from '../../lib/Svedit.svelte';
	import { KeyMapper } from '../../lib/index.js';
	import Layout from '../../routes/components/Layout.svelte';
	import type Session from '../../lib/Session.svelte.js';

	// Tests may pass their own KeyMapper to inspect the scope stack. It is read
	// once: the harness keeps one KeyMapper for its whole lifetime.
	let {
		session,
		key_mapper: provided_key_mapper
	}: { session: Session<any>; key_mapper?: KeyMapper } = $props();
	const key_mapper = untrack(() => provided_key_mapper) ?? new KeyMapper();

	// Mirror the +page.svelte setup so keydown events reach the
	// session keymap. Without this, key_mapper.push_scope() in
	// handle_canvas_focus is a no-op and dispatched Enter goes nowhere.
	setContext('key_mapper', key_mapper);
</script>

<Layout>
	<Svedit {session} editable={true} path={[session.doc.document_id]} />
</Layout>

<svelte:window onkeydown={key_mapper.handle_keydown.bind(key_mapper)} />
