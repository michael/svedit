<script>
	import { setContext, onMount, tick } from 'svelte';
	import { Svedit, Session, KeyMapper } from 'svedit';
	import { document_schema, session_config } from '../create_demo_session.js';
	import nanoid from '../nanoid.js';

	const PRESETS = [50, 100, 200, 500, 1000, 2000, 6000];

	let node_count = $state(200);
	let editable = $state(true);
	let mount_key = $state(0);
	let editor_wrapper;

	let live_fps = $state(0);
	let live_memory = $state(null);
	let render_ms = $state(null);
	let dom_el_count = $state(null);
	let gap_mk_count = $state(null);
	let scroll_result = $state(null);
	let resize_result = $state(null);
	let is_testing = $state(false);
	let benchmark_results = $state([]);

	let frame_times = [];
	let raf_id;

	/**
	 * Generate a mixed document with the given number of top-level nodes.
	 * Mix: ~60% text, ~15% story (with buttons), ~10% list (with items),
	 * ~5% image_grid (with grid items), ~10% headings.
	 * @param {number} count
	 */
	function generate_document(count) {
		/** @type {Record<string, any>} */
		const nodes = {};
		const body = [];

		for (let i = 0; i < count; i++) {
			const id = nanoid();
			const mod = i % 20;

			if (mod === 5 || mod === 15) {
				const btn_ids = [];
				for (let b = 0; b < 1 + (i % 3); b++) {
					const bid = nanoid();
					nodes[bid] = {
						id: bid, type: 'button',
						label: { text: `Action ${b + 1}`, annotations: [] },
						href: '#'
					};
					btn_ids.push(bid);
				}
				nodes[id] = {
					id, type: 'story', layout: (i % 3) + 1,
					title: { text: `Story ${body.length + 1}`, annotations: [] },
					description: {
						text: 'A paragraph of description text for this story block, providing enough content to simulate real editorial use in production.',
						annotations: []
					},
					image: '', buttons: btn_ids
				};
			} else if (mod === 10) {
				const items = [];
				for (let j = 0; j < 4; j++) {
					const lid = nanoid();
					nodes[lid] = {
						id: lid, type: 'list_item',
						content: { text: `List item ${j + 1} with sample content`, annotations: [] }
					};
					items.push(lid);
				}
				nodes[id] = { id, type: 'list', list_items: items, layout: 3 };
			} else if (mod === 0 && i > 0) {
				const grid_items = [];
				for (let g = 0; g < 3; g++) {
					const gid = nanoid();
					nodes[gid] = {
						id: gid, type: 'image_grid_item',
						image: '',
						title: { text: `Grid ${g + 1}`, annotations: [] },
						description: { text: 'Grid item description text', annotations: [] }
					};
					grid_items.push(gid);
				}
				nodes[id] = { id, type: 'image_grid', layout: 1, image_grid_items: grid_items };
			} else {
				nodes[id] = {
					id, type: 'text',
					layout: i % 5 === 0 ? 2 : 1,
					content: {
						text: `Paragraph ${body.length + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
						annotations: []
					}
				};
			}
			body.push(id);
		}

		nodes['perf_page'] = {
			id: 'perf_page', type: 'page',
			body, keywords: [], daily_visitors: [],
			created_at: new Date().toISOString()
		};
		return { document_id: 'perf_page', nodes };
	}

	function make_session() {
		const config = { ...session_config };
		const doc = generate_document(node_count);
		const s = new Session(document_schema, doc, config);
		s.validate_doc();
		return s;
	}

	let session = $state(make_session());

	async function apply_settings() {
		const t0 = performance.now();
		session = make_session();
		mount_key++;
		await tick();
		await new Promise(r => requestAnimationFrame(r));
		await new Promise(r => requestAnimationFrame(r));
		render_ms = Math.round(performance.now() - t0);
		await new Promise(r => setTimeout(r, 100));
		snap_counts();
	}

	function snap_counts() {
		dom_el_count = document.querySelectorAll('.svedit *').length;
		gap_mk_count = document.querySelectorAll('.gap-marker').length;
	}

	function fps_loop(now) {
		frame_times.push(now);
		if (frame_times.length > 120) frame_times.shift();
		if (frame_times.length >= 2) {
			const dt = frame_times[frame_times.length - 1] - frame_times[0];
			live_fps = Math.round((frame_times.length - 1) * 1000 / dt);
		}
		const perf = /** @type {any} */ (performance);
		if (perf.memory) {
			live_memory = Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
		}
		raf_id = requestAnimationFrame(fps_loop);
	}

	/** @param {number[]} stamps */
	function calc_fps_stats(stamps) {
		if (stamps.length < 2) return { avg: 0, min: 0, p5: 0, frames: 0 };
		const gaps = [];
		for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
		const total = stamps[stamps.length - 1] - stamps[0];
		const avg = Math.round((stamps.length - 1) * 1000 / total);
		gaps.sort((a, b) => b - a);
		const worst = gaps[0];
		const p95_idx = Math.floor(gaps.length * 0.05);
		return {
			avg,
			min: Math.round(1000 / worst),
			p5: Math.round(1000 / (gaps[p95_idx] || worst)),
			frames: stamps.length
		};
	}

	async function do_scroll_test() {
		is_testing = true;
		scroll_result = null;
		const el = document.documentElement;
		el.scrollTop = 0;
		await new Promise(r => setTimeout(r, 200));
		const max_scroll = el.scrollHeight - window.innerHeight;
		const dur = 3000;
		const stamps = [];
		const t0 = performance.now();
		await new Promise(resolve => {
			function step(now) {
				stamps.push(now);
				const p = Math.min((now - t0) / dur, 1);
				el.scrollTop = p * max_scroll;
				if (p < 1) requestAnimationFrame(step); else resolve();
			}
			requestAnimationFrame(step);
		});
		scroll_result = calc_fps_stats(stamps);
		is_testing = false;
	}

	async function do_resize_test() {
		if (!editor_wrapper) return;
		is_testing = true;
		resize_result = null;
		const stamps = [];
		const total_steps = 60;
		let i = 0;
		await new Promise(resolve => {
			function step(now) {
				stamps.push(now);
				const p = i / total_steps;
				editor_wrapper.style.maxWidth = `${Math.round(1200 - 800 * Math.sin(p * Math.PI))}px`;
				i++;
				if (i <= total_steps) requestAnimationFrame(step);
				else { editor_wrapper.style.maxWidth = ''; resolve(); }
			}
			requestAnimationFrame(step);
		});
		resize_result = calc_fps_stats(stamps);
		is_testing = false;
	}

	async function run_full_benchmark() {
		is_testing = true;
		benchmark_results = [];

		for (const count of PRESETS) {
			node_count = count;

			const t0 = performance.now();
			session = make_session();
			mount_key++;
			await tick();
			await new Promise(r => requestAnimationFrame(r));
			await new Promise(r => requestAnimationFrame(r));
			const r_ms = Math.round(performance.now() - t0);
			await new Promise(r => setTimeout(r, 500));

			const d = document.querySelectorAll('.svedit *').length;
			const g = document.querySelectorAll('.gap-marker').length;
			const perf = /** @type {any} */ (performance);
			const m = perf.memory
				? Math.round(perf.memory.usedJSHeapSize / 1024 / 1024)
				: null;

			const s_fps = await quick_scroll_test(2000);
			await new Promise(r => setTimeout(r, 200));

			const rz_fps = await quick_resize_test(40);
			await new Promise(r => setTimeout(r, 200));

			benchmark_results = [...benchmark_results, {
				nodes: count,
				render_ms: r_ms, dom_el: d, gaps: g, memory: m,
				scroll_avg: s_fps.avg, scroll_min: s_fps.min,
				resize_avg: rz_fps.avg, resize_min: rz_fps.min
			}];
		}
		is_testing = false;
	}

	/** @param {number} dur */
	async function quick_scroll_test(dur) {
		const el = document.documentElement;
		el.scrollTop = 0;
		await new Promise(r => setTimeout(r, 100));
		const max_scroll = el.scrollHeight - window.innerHeight;
		const stamps = [];
		const t0 = performance.now();
		await new Promise(resolve => {
			function step(now) {
				stamps.push(now);
				const p = Math.min((now - t0) / dur, 1);
				el.scrollTop = p * max_scroll;
				if (p < 1) requestAnimationFrame(step); else resolve();
			}
			requestAnimationFrame(step);
		});
		el.scrollTop = 0;
		return calc_fps_stats(stamps);
	}

	/** @param {number} total_steps */
	async function quick_resize_test(total_steps) {
		if (!editor_wrapper) return { avg: 0, min: 0, p5: 0, frames: 0 };
		const stamps = [];
		let i = 0;
		await new Promise(resolve => {
			function step(now) {
				stamps.push(now);
				editor_wrapper.style.maxWidth = `${Math.round(1200 - 800 * Math.sin(i / total_steps * Math.PI))}px`;
				i++;
				if (i <= total_steps) requestAnimationFrame(step);
				else { editor_wrapper.style.maxWidth = ''; resolve(); }
			}
			requestAnimationFrame(step);
		});
		return calc_fps_stats(stamps);
	}

	const key_mapper = new KeyMapper();
	setContext('key_mapper', key_mapper);

	async function run_matrix_test() {
		const overscan_values = [250, 500, 1000, 2000];
		const debounce_values = [0, 5, 10, 20];
		const node_counts = [200, 500, 1000, 6000];
		const results = [];
		
		is_testing = true;
		
		for (const overscan of overscan_values) {
			for (const debounce of debounce_values) {
				/** @type {any} */ (window).__culling_config.overscan = overscan;
				/** @type {any} */ (window).__culling_config.debounce = debounce;
				
				for (const count of node_counts) {
					node_count = count;
					
					const t0 = performance.now();
					session = make_session();
					mount_key++;
					await tick();
					await new Promise(r => requestAnimationFrame(r));
					await new Promise(r => requestAnimationFrame(r));
					await new Promise(r => setTimeout(r, 1000));
					if (count >= 2000) await new Promise(r => setTimeout(r, 3000));
					
					const scroll = await quick_scroll_test(2000);
					await new Promise(r => setTimeout(r, 200));
					
					const dom = document.querySelectorAll('.svedit *').length;
					const gap_mk = document.querySelectorAll('.gap-marker').length;
					const perf = /** @type {any} */ (performance);
					const mem = perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1024 / 1024) : null;
					
					results.push({
						overscan, debounce, nodes: count,
						scroll_avg: scroll.avg, scroll_min: scroll.min,
						dom, gaps: gap_mk, mem
					});
					
					console.log(`overscan=${overscan} debounce=${debounce} nodes=${count}: scroll=${scroll.avg}/${scroll.min} dom=${dom} gaps=${gap_mk}`);
				}
			}
		}
		
		/** @type {any} */ (window).__matrix_results = results;
		console.log('DONE', JSON.stringify(results));
		is_testing = false;
		return results;
	}

	onMount(() => {
		raf_id = requestAnimationFrame(fps_loop);
		setTimeout(snap_counts, 500);
		/** @type {any} */ (window).__perf = {
			run_full_benchmark,
			apply_settings,
			run_matrix_test,
			get results() { return benchmark_results; }
		};
		return () => { cancelAnimationFrame(raf_id); delete /** @type {any} */ (window).__perf; };
	});
</script>

<svelte:head>
	<title>Svedit Performance Test</title>
</svelte:head>

<div class="perf-controls" data-testid="perf-controls">
	<div class="control-row">
		<span class="label">Nodes:</span>
		{#each PRESETS as n (n)}
			<button
				class:active={node_count === n}
				onclick={() => node_count = n}
				data-node-count={n}
			>{n}</button>
		{/each}
	</div>
	<div class="control-row">
		<button class="primary" onclick={apply_settings} disabled={is_testing} data-testid="apply-btn">
			Apply & Measure
		</button>
		<button onclick={do_scroll_test} disabled={is_testing}>Scroll Test</button>
		<button onclick={do_resize_test} disabled={is_testing}>Resize Test</button>
		<button onclick={run_full_benchmark} disabled={is_testing} data-testid="benchmark-btn">
			Full Benchmark
		</button>
		<button onclick={run_matrix_test} disabled={is_testing} data-testid="matrix-btn" class="matrix-btn">
			Matrix Test
		</button>
	</div>
	<div class="metrics-row" data-testid="live-metrics">
		<span>FPS: <strong data-metric="fps">{live_fps}</strong></span>
		{#if live_memory !== null}
			<span>Heap: <strong data-metric="memory">{live_memory} MB</strong></span>
		{/if}
		{#if render_ms !== null}
			<span>Render: <strong data-metric="render">{render_ms}ms</strong></span>
		{/if}
		{#if dom_el_count !== null}
			<span>DOM: <strong data-metric="dom">{dom_el_count}</strong></span>
		{/if}
		{#if gap_mk_count !== null}
			<span>Gaps: <strong data-metric="gaps">{gap_mk_count}</strong></span>
		{/if}
	</div>
	{#if scroll_result}
		<div class="metrics-row test-result">
			Scroll: avg <strong>{scroll_result.avg}</strong> fps,
			min <strong>{scroll_result.min}</strong> fps,
			p5 <strong>{scroll_result.p5}</strong> fps
			({scroll_result.frames} frames)
		</div>
	{/if}
	{#if resize_result}
		<div class="metrics-row test-result">
			Resize: avg <strong>{resize_result.avg}</strong> fps,
			min <strong>{resize_result.min}</strong> fps,
			p5 <strong>{resize_result.p5}</strong> fps
			({resize_result.frames} frames)
		</div>
	{/if}
	{#if is_testing}
		<div class="metrics-row testing-indicator">Running test...</div>
	{/if}
</div>

{#if benchmark_results.length > 0}
	<div class="results-table" data-testid="results-table">
		<table>
			<thead>
				<tr>
					<th>Nodes</th>
					<th>Render (ms)</th>
					<th>DOM els</th>
					<th>Gap markers</th>
					<th>Memory (MB)</th>
					<th>Scroll avg</th>
					<th>Scroll min</th>
					<th>Resize avg</th>
					<th>Resize min</th>
				</tr>
			</thead>
			<tbody>
				{#each benchmark_results as r (r.nodes)}
					<tr>
						<td>{r.nodes}</td>
						<td>{r.render_ms}</td>
						<td>{r.dom_el}</td>
						<td>{r.gaps}</td>
						<td>{r.memory ?? '–'}</td>
						<td>{r.scroll_avg}</td>
						<td>{r.scroll_min}</td>
						<td>{r.resize_avg}</td>
						<td>{r.resize_min}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<div class="editor-area" bind:this={editor_wrapper}>
	{#key mount_key}
		<Svedit {session} bind:editable path={[session.doc.document_id]} />
	{/key}
</div>

<svelte:window onkeydown={key_mapper.handle_keydown.bind(key_mapper)} />

<style>
	.perf-controls {
		position: sticky;
		top: 0;
		z-index: 100;
		background: white;
		border-bottom: 2px solid #e0e0e0;
		padding: 8px 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-family: system-ui, -apple-system, sans-serif;
		font-size: 13px;
	}

	.control-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.label {
		font-weight: 600;
		min-width: 60px;
	}

	.perf-controls button {
		padding: 4px 10px;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
		cursor: pointer;
		font-size: 12px;
		transition: background 0.1s, color 0.1s;
	}

	.perf-controls button:hover:not(:disabled) {
		background: #e0e0e0;
	}

	.perf-controls button.active {
		background: #333;
		color: white;
		border-color: #333;
	}

	.perf-controls button.primary {
		background: oklch(59.71% 0.22 283);
		color: white;
		border-color: oklch(59.71% 0.22 283);
	}

	.perf-controls button.matrix-btn {
		background: oklch(45% 0.15 150);
		color: white;
		border-color: oklch(45% 0.15 150);
	}

	.perf-controls button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.metrics-row {
		display: flex;
		gap: 16px;
		color: #555;
		flex-wrap: wrap;
	}

	.metrics-row strong {
		color: #111;
	}

	.test-result {
		color: oklch(45% 0.15 150);
	}

	.testing-indicator {
		color: oklch(59.71% 0.22 283);
		font-weight: 600;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		50% { opacity: 0.5; }
	}

	.results-table {
		margin: 8px 16px;
		overflow-x: auto;
	}

	.results-table table {
		width: 100%;
		border-collapse: collapse;
		font-family: system-ui, sans-serif;
		font-size: 12px;
	}

	.results-table th,
	.results-table td {
		padding: 4px 8px;
		border: 1px solid #ddd;
		text-align: right;
	}

	.results-table th {
		background: #f5f5f5;
		font-weight: 600;
		text-align: center;
	}


	.editor-area {
		margin: 0 auto;
		max-width: 1200px;
	}
</style>
