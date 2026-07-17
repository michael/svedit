/**
 * Editing benchmarks and timing instrumentation for the perftest page.
 *
 * Instrumentation wraps Session/Transaction prototype methods with wall-time
 * accumulators so end-to-end benchmark numbers can be attributed to specific
 * internals without touching library code. Note: timings are total (inclusive)
 * time per method — nested calls are counted in their parents too.
 *
 * Data model note: on this base a `text` property is `{content, marks,
 * annotations}` and a `node_array` property is `{nodes, marks, annotations}`.
 */

import { tick } from 'svelte';
import { Session, Transaction } from 'svedit';

let timings: Record<string, { calls: number; ms: number }> = {};

let instrumented = false;

function wrap_method(proto: any, name: string, label: string) {
	const original = proto[name];
	if (typeof original !== 'function') return;
	proto[name] = function (...args) {
		const t0 = performance.now();
		try {
			return original.apply(this, args);
		} finally {
			const entry = (timings[label] ??= { calls: 0, ms: 0 });
			entry.calls += 1;
			entry.ms += performance.now() - t0;
		}
	};
}

export function install_instrumentation() {
	if (instrumented || typeof window === 'undefined') return;
	instrumented = true;
	wrap_method(Session.prototype, 'get', 'session.get');
	wrap_method(Session.prototype, 'inspect', 'session.inspect');
	wrap_method(Session.prototype, 'apply', 'session.apply');
	wrap_method(Session.prototype, 'validate_transaction_result', 'session.validate_transaction_result');
	wrap_method(Session.prototype, 'traverse', 'session.traverse');
	wrap_method(Session.prototype, 'undo', 'session.undo');
	wrap_method(Transaction.prototype, '_apply_op', 'tr._apply_op');
	wrap_method(Transaction.prototype, 'set', 'tr.set');
	wrap_method(Transaction.prototype, 'create', 'tr.create');
	wrap_method(Transaction.prototype, 'delete', 'tr.delete');
	wrap_method(Transaction.prototype, 'build', 'tr.build');
	wrap_method(Transaction.prototype, '_cascade_delete_unreferenced_nodes', 'tr._cascade_delete');
}

export function timings_reset() {
	timings = {};
}

export function timings_get() {
	
	const out = {};
	for (const [key, value] of Object.entries(timings)) {
		out[key] = { calls: value.calls, ms: Math.round(value.ms * 100) / 100 };
	}
	return out;
}

/**
 * Resolve on the next animation frame, falling back to a timeout when the
 * tab is hidden (rAF never fires there). Frame timings are only meaningful
 * when the tab is visible — use force_layout for deterministic layout cost.
 */
function next_frame() {
	return new Promise((resolve) => {
		const id = requestAnimationFrame(() => {
			clearTimeout(timer);
			resolve('raf');
		});
		const timer = setTimeout(() => {
			cancelAnimationFrame(id);
			resolve('timeout');
		}, 32);
	});
}

/**
 * Force a synchronous full-document layout and return its duration in ms.
 * Works in hidden tabs (layout is computed on demand; only paint is skipped).
 */
function force_layout() {
	const t0 = performance.now();
	void document.documentElement.offsetHeight;
	return performance.now() - t0;
}

function stats(values: number[]) {
	if (values.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0 };
	const sorted = [...values].sort((a, b) => a - b);
	const sum = sorted.reduce((acc, value) => acc + value, 0);
	const pick = (q: number) =>
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
	const round = (value: number) => Math.round(value * 100) / 100;
	return {
		avg: round(sum / sorted.length),
		p50: round(pick(0.5)),
		p95: round(pick(0.95)),
		max: round(sorted[sorted.length - 1])
	};
}

/**
 * @returns index of the last text-kind node in the document body
 */
function last_text_node_index(session: any): number {
	const body = session.get([session.document_id, 'body']).nodes;
	for (let i = body.length - 1; i >= 0; i--) {
		if (session.kind(session.get(body[i])) === 'text') return i;
	}
	throw new Error('No text node found in body');
}

/**
 * Put a collapsed text caret at the end of the last text node in the body.
 */
function place_caret_in_last_text_node(session: any) {
	const index = last_text_node_index(session);
	const path = [session.document_id, 'body', index, 'content'];
	const text = session.get(path).content;
	// Offsets are grapheme-based; ASCII fixture text means length is fine.
	session.selection = {
		type: 'text',
		path,
		anchor_offset: text.length,
		focus_offset: text.length
	};
	return path;
}

/**
 * Simulate holding Enter: repeatedly execute the break_text_node command,
 * exactly like the keymap does on a real keydown.
 *
 */
export async function bench_enter(ctx: { session: any; focus: () => void }, count = 20) {
	const { session } = ctx;
	ctx.focus();
	place_caret_in_last_text_node(session);
	await tick();

	const data_ms = [];
	const render_ms = [];
	const layout_ms = [];
	const t_start = performance.now();
	for (let i = 0; i < count; i++) {
		const t0 = performance.now();
		session.commands.break_text_node.execute();
		const t1 = performance.now();
		await tick();
		const t2 = performance.now();
		layout_ms.push(force_layout());
		data_ms.push(t1 - t0);
		render_ms.push(t2 - t1);
	}
	return {
		op: 'enter',
		count,
		total_ms: Math.round(performance.now() - t_start),
		data: stats(data_ms),
		render: stats(render_ms),
		layout: stats(layout_ms)
	};
}

/**
 * Simulate fast typing: insert one character per iteration via insert_text,
 * like onbeforeinput does.
 *
 */
export async function bench_type(ctx: { session: any; focus: () => void }, count = 30) {
	const { session } = ctx;
	ctx.focus();
	place_caret_in_last_text_node(session);
	await tick();

	const data_ms = [];
	const render_ms = [];
	const layout_ms = [];
	const t_start = performance.now();
	for (let i = 0; i < count; i++) {
		const t0 = performance.now();
		const tr = session.tr;
		tr.insert_text('x');
		session.apply(tr, { batch: true });
		const t1 = performance.now();
		await tick();
		const t2 = performance.now();
		layout_ms.push(force_layout());
		data_ms.push(t1 - t0);
		render_ms.push(t2 - t1);
	}
	return {
		op: 'type',
		count,
		total_ms: Math.round(performance.now() - t_start),
		data: stats(data_ms),
		render: stats(render_ms),
		layout: stats(layout_ms)
	};
}

function make_paste_payload(m: number) {
	const nodes = {};
	const main_nodes = [];
	for (let i = 0; i < m; i++) {
		const id = `paste_src_${i}`;
		nodes[id] = {
			id,
			type: 'paragraph',
			content: {
				content: `Pasted paragraph ${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.`,
				marks: [],
				annotations: []
			}
		};
		main_nodes.push(id);
	}
	return { nodes, main_nodes };
}

/**
 * Simulate pasting m text nodes, replicating the node-paste data path
 * (tr.build per node + insert_nodes + apply).
 *
 */
export async function bench_paste(ctx: { session: any; focus: () => void }, m = 100, mode = 'append') {
	const { session } = ctx;
	ctx.focus();
	const body_path = [session.document_id, 'body'];
	const body_length = session.get(body_path).nodes.length;
	session.selection =
		mode === 'replace'
			? { type: 'node', path: body_path, anchor_offset: 0, focus_offset: Math.min(m, body_length) }
			: { type: 'node', path: body_path, anchor_offset: body_length, focus_offset: body_length };
	await tick();

	const { nodes, main_nodes } = make_paste_payload(m);
	const t0 = performance.now();
	const tr = session.tr;
	const nodes_to_insert = [];
	for (const node_id of main_nodes) {
		nodes_to_insert.push(tr.build(node_id, nodes));
	}
	tr.insert_nodes(nodes_to_insert);
	session.apply(tr);
	const t1 = performance.now();
	await tick();
	const t2 = performance.now();
	const layout = force_layout();
	return {
		op: `paste_${mode}`,
		m,
		data_ms: Math.round(t1 - t0),
		render_ms: Math.round(t2 - t1),
		layout_ms: Math.round(layout)
	};
}

/**
 * Simulate copying m nodes, replicating the copy path
 * (session.traverse per selected node).
 *
 */
export async function bench_copy(ctx: { session: any; focus: () => void }, m = 100) {
	const { session } = ctx;
	ctx.focus();
	const body_path = [session.document_id, 'body'];
	const body_length = session.get(body_path).nodes.length;
	session.selection = {
		type: 'node',
		path: body_path,
		anchor_offset: 0,
		focus_offset: Math.min(m, body_length)
	};
	await tick();

	const t0 = performance.now();
	const selected_node_ids = session.get_selected_nodes();
	/** @type {Record<string, any>} */
	const nodes = {};
	for (const node_id of selected_node_ids) {
		const subgraph = session.traverse(node_id);
		for (const node of subgraph) {
			if (!nodes[node.id]) nodes[node.id] = node;
		}
	}
	const t1 = performance.now();
	return {
		op: 'copy',
		m,
		payload_nodes: Object.keys(nodes).length,
		data_ms: Math.round(t1 - t0)
	};
}

/**
 * Simulate deleting m selected nodes (cut without clipboard).
 *
 */
export async function bench_delete(ctx: { session: any; focus: () => void }, m = 100) {
	const { session } = ctx;
	ctx.focus();
	const body_path = [session.document_id, 'body'];
	const body_length = session.get(body_path).nodes.length;
	session.selection = {
		type: 'node',
		path: body_path,
		anchor_offset: 0,
		focus_offset: Math.min(m, body_length)
	};
	await tick();

	const t0 = performance.now();
	session.apply(session.tr.delete_selection());
	const t1 = performance.now();
	await tick();
	const t2 = performance.now();
	const layout = force_layout();
	return {
		op: 'delete',
		m,
		data_ms: Math.round(t1 - t0),
		render_ms: Math.round(t2 - t1),
		layout_ms: Math.round(layout)
	};
}

/**
 * Undo the last change (interesting after paste/delete — replays inverse ops).
 *
 * @param {{ session: any }} ctx
 */
export async function bench_undo(ctx: { session: any; focus: () => void }) {
	const { session } = ctx;
	const t0 = performance.now();
	session.undo();
	const t1 = performance.now();
	await tick();
	const t2 = performance.now();
	const layout = force_layout();
	return {
		op: 'undo',
		data_ms: Math.round(t1 - t0),
		render_ms: Math.round(t2 - t1),
		layout_ms: Math.round(layout)
	};
}

/**
 * Run a function under the JS self-profiling API and return top stack frames
 * by sample count. Requires the Document-Policy: js-profiling header.
 *
 * @param top - how many frames to report
 */
export async function profile(fn: () => Promise<any>, top = 30) {
	const ProfilerCtor = (window as any).Profiler;
	if (!ProfilerCtor) return { error: 'Profiler API unavailable (missing js-profiling document policy?)' };
	const profiler = new ProfilerCtor({ sampleInterval: 1, maxBufferSize: 1_000_000 });
	const result = await fn();
	const trace = await profiler.stop();

	const self_counts = new Map();
	const total_counts = new Map();
	const frame_name = (/** @type {number} */ frame_id) => {
		const frame = trace.frames[frame_id];
		if (!frame) return '(unknown)';
		const resource = frame.resourceId !== undefined ? trace.resources[frame.resourceId] : '';
		const file = resource ? String(resource).split('/').slice(-1)[0].split('?')[0] : '';
		return `${frame.name || '(anonymous)'} [${file}:${frame.line ?? '?'}]`;
	};
	for (const sample of trace.samples) {
		if (sample.stackId === undefined) continue;
		let stack_id = sample.stackId;
		let leaf = true;
		const seen = new Set();
		while (stack_id !== undefined) {
			const node = trace.stacks[stack_id];
			if (!node) break;
			const name = frame_name(node.frameId);
			if (leaf) {
				self_counts.set(name, (self_counts.get(name) || 0) + 1);
				leaf = false;
			}
			if (!seen.has(name)) {
				seen.add(name);
				total_counts.set(name, (total_counts.get(name) || 0) + 1);
			}
			stack_id = node.parentId;
		}
	}
	const to_sorted = (/** @type {Map<string, number>} */ map) =>
		[...map.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, top)
			.map(([name, count]) => ({ name, samples: count }));
	return {
		result,
		total_samples: trace.samples.length,
		self: to_sorted(self_counts),
		total: to_sorted(total_counts)
	};
}

/**
 * Measure synchronous relayout cost while alternating the editor wrapper
 * width — a deterministic proxy for window-resize cost that also works in
 * hidden tabs. Each step invalidates layout and forces a full reflow.
 *
 */
export async function bench_resize_layout(ctx: { wrapper: HTMLElement }, steps = 20) {
	const wrapper = ctx.wrapper;
	if (!wrapper) throw new Error('No editor wrapper');
	const layout_ms = [];
	await next_frame();
	force_layout();
	for (let i = 0; i < steps; i++) {
		wrapper.style.maxWidth = i % 2 === 0 ? '700px' : '1100px';
		layout_ms.push(force_layout());
		// Yield so style recalc doesn't coalesce across iterations.
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	wrapper.style.maxWidth = '';
	force_layout();
	return { op: 'resize_layout', steps, layout: stats(layout_ms) };
}
