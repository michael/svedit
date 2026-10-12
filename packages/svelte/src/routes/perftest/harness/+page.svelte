<script lang="ts">
	import { flushSync, onMount, setContext } from 'svelte';
	import { Svedit, Session, KeyMapper } from 'svedit';
	import { app_config } from '../../demo_config.js';
	import { document_schema } from '@svedit/demo-shared/src/demo_schema.js';
	import { install_harness } from '@svedit/demo-shared/src/perftest/suite.js';

	// Benchmark harness for the comparison page at /perftest: the editor and
	// nothing else. The suite runs in this document via window.__svedit_perf.

	const key_mapper = new KeyMapper();
	setContext('key_mapper', key_mapper);

	let session = $state.raw<Session<typeof document_schema> | null>(null);
	let mount_key = $state(0);
	let editable = $state(true);
	let svedit_ref = $state<Svedit<typeof document_schema>>();
	let wrapper: HTMLElement;

	onMount(() =>
		install_harness({
			framework: 'Svelte',
			mode: import.meta.env.DEV ? 'development' : 'production',
			async mount(doc) {
				session = new Session(document_schema, doc, app_config);
				mount_key += 1;
				flushSync();
			},
			session: () => session,
			focus: () => svedit_ref?.focus_canvas(),
			async settle() {
				flushSync();
			},
			wrapper: () => wrapper
		})
	);
</script>

<svelte:head>
	<title>Svedit perf harness (Svelte)</title>
</svelte:head>

<div class="perf-harness" bind:this={wrapper}>
	{#if session}
		{#key mount_key}
			<Svedit bind:this={svedit_ref} {session} bind:editable path={[session.doc.document_id]} />
		{/key}
	{/if}
</div>

<svelte:window onkeydown={(event) => key_mapper.handle_keydown(event)} />

<style>
	.perf-harness {
		margin: 0 auto;
	}
</style>
