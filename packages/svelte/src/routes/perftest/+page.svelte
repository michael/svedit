<script lang="ts">
	import { onMount } from 'svelte';
	import { BENCHES } from '@svedit/demo-shared/src/perftest/suite.js';
	import type {
		BenchId,
		Framework,
		PerfHarnessHandle,
		SuiteResult
	} from '@svedit/demo-shared/src/perftest/suite.js';
	import {
		FRAMEWORKS,
		dom_sizes,
		format_ms,
		summarize,
		to_markdown
	} from '@svedit/demo-shared/src/perftest/report.js';

	// Runs the shared benchmark suite against the Svelte, React, Vue and Solid editors
	// and compares them. Each framework's harness is loaded in the same
	// fixed-size iframe, one at a time, in a fresh document per round; the
	// framework order rotates every round.

	const HARNESS_URLS: Record<Framework, string> = {
		Svelte: '/perftest/harness',
		React: '/react/perftest/harness',
		Vue: '/vue/perftest/harness',
		Solid: '/solid/perftest/harness'
	};
	const NODE_COUNT_OPTIONS = [100, 200, 500, 1000, 2000, 3000, 5000];

	let node_counts = $state([200, 1000, 3000]);
	let rounds = $state(3);
	let selected_benches = $state<BenchId[]>(BENCHES.map((bench) => bench.id));
	let results = $state<SuiteResult[]>([]);
	let running = $state(false);
	let progress = $state('');
	let error = $state('');
	let harness_mode = $state<string | null>(null);
	let copied = $state<'markdown' | 'json' | null>(null);
	let iframe: HTMLIFrameElement;

	let rows = $derived(summarize(results));
	let sizes = $derived(dom_sizes(results));
	let warnings = $derived([
		...new Set(
			results.flatMap((r) => r.warnings.map((w) => `${r.framework} (${r.node_count} nodes): ${w}`))
		)
	]);
	let is_development = $derived(
		import.meta.env.DEV || results.some((result) => result.mode === 'development')
	);

	function log(message: string) {
		progress = message;
		console.log(`[perftest] ${message}`);
	}

	async function load_harness(framework: Framework): Promise<PerfHarnessHandle> {
		const loaded = new Promise((resolve) =>
			iframe.addEventListener('load', resolve, { once: true })
		);
		iframe.src = `${HARNESS_URLS[framework]}?run=${Date.now()}`;
		await loaded;
		const deadline = performance.now() + 30_000;
		while (performance.now() < deadline) {
			const handle = iframe.contentWindow?.__svedit_perf;
			if (handle) return handle;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		throw new Error(
			`The ${framework} harness at ${HARNESS_URLS[framework]} did not start. Run the whole site: pnpm dev:site, or pnpm build:site && pnpm preview:site.`
		);
	}

	async function run() {
		running = true;
		error = '';
		results = [];
		const counts = [...node_counts].sort((a, b) => a - b);
		try {
			for (let round = 0; round < rounds; round++) {
				const order = FRAMEWORKS.map((_, i) => FRAMEWORKS[(i + round) % FRAMEWORKS.length]);
				for (const framework of order) {
					log(`Round ${round + 1}/${rounds}: loading ${framework}`);
					const handle = await load_harness(framework);
					harness_mode = handle.mode;
					for (const node_count of counts) {
						log(`Round ${round + 1}/${rounds}: ${framework}, ${node_count} nodes`);
						const result = await handle.run_suite(node_count, $state.snapshot(selected_benches));
						results = [...results, result];
					}
				}
			}
			log(`Done: ${rounds} round(s), ${counts.length} document size(s)`);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			log(`Failed: ${error}`);
		} finally {
			iframe.src = 'about:blank';
			running = false;
			window.__svedit_perf_report = {
				error: error || null,
				results: $state.snapshot(results),
				markdown: report_markdown()
			};
		}
	}

	function report_markdown() {
		return to_markdown($state.snapshot(results), {
			mode: is_development ? 'Development' : 'Production',
			rounds,
			user_agent: navigator.userAgent,
			date: new Date().toISOString().slice(0, 10)
		});
	}

	async function copy(kind: 'markdown' | 'json') {
		const text =
			kind === 'markdown' ? report_markdown() : JSON.stringify($state.snapshot(results), null, 2);
		await navigator.clipboard.writeText(text);
		copied = kind;
		setTimeout(() => (copied = null), 1500);
	}

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
	}

	// ?auto runs immediately, optionally with ?nodes=200,1000&rounds=2&benches=type,enter
	// (used by `pnpm perftest`, which reads window.__svedit_perf_report).
	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const nodes = params.get('nodes');
		if (nodes) node_counts = nodes.split(',').map(Number).filter(Boolean);
		const round_param = Number(params.get('rounds'));
		if (round_param > 0) rounds = round_param;
		const benches = params.get('benches');
		if (benches) {
			const ids = new Set(benches.split(','));
			selected_benches = BENCHES.filter((bench) => ids.has(bench.id)).map((bench) => bench.id);
		}
		if (params.has('auto')) run();
	});
</script>

<svelte:head>
	<title>Svedit performance: Svelte, React, Vue, Solid</title>
</svelte:head>

<div class="perftest">
	<header>
		<h1>Svelte vs React vs Vue vs Solid</h1>
		<p>
			The same editor, document and operations in all four frameworks. Each step is timed until the
			framework has updated the DOM (Svelte and React: <code>flushSync</code>, Vue:
			<code>nextTick</code>, Solid: synchronously on write), and the suite checks the DOM really
			changed. The core logic is shared, so differences come from how each binding renders.
		</p>
		{#if is_development}
			<p class="notice">
				This is a development build. Dev builds add framework checks (React's most of all), so the
				numbers are not representative. For a real comparison run
				<code>pnpm build:site && pnpm preview:site</code> and open /perftest there, or run
				<code>pnpm perftest</code> for a headless run in the terminal.
			</p>
		{/if}
	</header>

	<section class="controls">
		<div class="control">
			<span class="label">Document sizes (top-level nodes)</span>
			<div class="options">
				{#each NODE_COUNT_OPTIONS as count (count)}
					<label>
						<input
							type="checkbox"
							checked={node_counts.includes(count)}
							disabled={running}
							onchange={() => (node_counts = toggle(node_counts, count))}
						/>
						{count}
					</label>
				{/each}
			</div>
		</div>
		<div class="control">
			<span class="label">Benchmarks</span>
			<div class="options">
				{#each BENCHES as bench (bench.id)}
					<label title={bench.description}>
						<input
							type="checkbox"
							checked={selected_benches.includes(bench.id)}
							disabled={running}
							onchange={() => (selected_benches = toggle(selected_benches, bench.id))}
						/>
						{bench.label}
					</label>
				{/each}
			</div>
		</div>
		<div class="control">
			<label class="label" for="perftest-rounds">Rounds</label>
			<input
				id="perftest-rounds"
				type="number"
				min="1"
				max="10"
				bind:value={rounds}
				disabled={running}
			/>
			<button
				class="primary"
				onclick={run}
				disabled={running || node_counts.length === 0 || selected_benches.length === 0}
			>
				{running ? 'Running…' : 'Run comparison'}
			</button>
			<span class="progress">{progress}</span>
		</div>
		{#if error}<p class="error">{error}</p>{/if}
	</section>

	{#if rows.length > 0}
		<section class="results">
			<div class="results-header">
				<h2>Median ms per step <small>(p95)</small>, lower is better</h2>
				<div>
					<button onclick={() => copy('markdown')}
						>{copied === 'markdown' ? 'Copied' : 'Copy Markdown'}</button
					>
					<button onclick={() => copy('json')}>{copied === 'json' ? 'Copied' : 'Copy JSON'}</button>
				</div>
			</div>
			<table>
				<thead>
					<tr>
						<th>Benchmark</th>
						<th class="number">Nodes</th>
						{#each FRAMEWORKS as framework (framework)}
							<th class="number">{framework}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.bench + row.node_count)}
						<tr>
							<td title={BENCHES.find((bench) => bench.id === row.bench)?.description}
								>{row.label}</td
							>
							<td class="number">{row.node_count}</td>
							{#each FRAMEWORKS as framework (framework)}
								{@const cell = row.cells[framework]}
								<td class="number" class:fastest={row.fastest === framework}>
									{#if cell}
										{format_ms(cell.median)} <small>({format_ms(cell.p95)})</small>
									{:else}–{/if}
								</td>
							{/each}
						</tr>
					{/each}
					{#each Object.entries(sizes) as [node_count, by_framework] (node_count)}
						<tr class="info">
							<td>DOM elements after mount</td>
							<td class="number">{node_count}</td>
							{#each FRAMEWORKS as framework (framework)}
								<td class="number">{by_framework[framework] ?? '–'}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="legend">
				Highlighted: at least 5% faster than the other two. {results.length} runs
				{#if harness_mode}({harness_mode} build){/if}.
			</p>
			{#if warnings.length > 0}
				<ul class="warnings">
					{#each warnings as warning (warning)}<li>{warning}</li>{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<section class="stage">
		<iframe bind:this={iframe} title="Benchmark harness" src="about:blank"></iframe>
	</section>
</div>

<style>
	.perftest {
		max-width: 1100px;
		margin: 0 auto;
		padding: 4.5rem 1rem 3rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 14px;
		line-height: 1.5;
		color: var(--foreground);
	}
	h1 {
		font-size: 1.8rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}
	h2 {
		font-size: 1rem;
		font-weight: 600;
	}
	header p {
		max-width: 72ch;
		margin-bottom: 0.75rem;
	}
	code {
		font-size: 0.9em;
		background: color-mix(in oklch, var(--background) 92%, var(--foreground));
		padding: 0.05em 0.3em;
		border-radius: 3px;
	}
	.notice,
	.error {
		padding: 0.6rem 0.8rem;
		border-radius: 6px;
		border: 1px solid color-mix(in oklch, var(--accent) 40%, transparent);
		background: color-mix(in oklch, var(--accent) 8%, var(--background));
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 1.25rem 0;
		padding: 0.9rem 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.control {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.9rem;
	}
	.label {
		font-weight: 600;
		min-width: 15rem;
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.9rem;
	}
	.options label {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		cursor: pointer;
	}
	input[type='number'] {
		width: 4rem;
		padding: 0.2rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--background);
		color: var(--foreground);
	}
	button {
		padding: 0.35rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--background);
		color: var(--foreground);
		cursor: pointer;
	}
	button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--background);
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.progress {
		opacity: 0.75;
	}
	.results-header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.results {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		padding: 0.35rem 0.6rem;
		border-bottom: 1px solid var(--border);
		text-align: left;
		white-space: nowrap;
	}
	th {
		font-weight: 600;
	}
	.number {
		text-align: right;
	}
	td small,
	h2 small {
		opacity: 0.6;
		font-weight: 400;
	}
	td.fastest {
		font-weight: 700;
		color: var(--accent);
	}
	tr.info td {
		opacity: 0.75;
	}
	.legend {
		margin-top: 0.5rem;
		opacity: 0.75;
	}
	.warnings {
		margin-top: 0.5rem;
		padding-left: 1.2rem;
		list-style: disc;
		color: var(--accent);
	}
	.stage {
		margin-top: 1.5rem;
		overflow: auto;
	}
	.stage iframe {
		display: block;
		width: 1000px;
		height: 700px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--background);
	}
</style>
