/**
 * The performance benchmark suite shared by the Svelte, React and Vue demos.
 *
 * Each framework provides a small harness (a route that mounts the editor and
 * implements `PerfHarness`); the suite runs the same operations against all
 * three. The comparison page (`/perftest` in the Svelte demo) loads each
 * harness in an iframe and calls `run_suite` through `window.__svedit_perf`.
 *
 * Every measured operation includes the framework's DOM update: the harness's
 * `settle()` resolves once pending session changes have been applied to the
 * DOM, effects included (Svelte and React: `flushSync`, Vue: `nextTick`). The
 * suite checks that the DOM really reflects each change right after
 * `settle()`, so a framework cannot look fast by deferring work.
 */
import { serialize_path } from '@svedit/core';
import type { Document, DocumentNode, DocumentPath } from '@svedit/core';
import nanoid from '../nanoid.js';

export type Framework = 'Svelte' | 'React' | 'Vue';

export type PerfHarness = {
	framework: Framework;
	/** Build mode of the harness page; only production numbers are meaningful. */
	mode: 'development' | 'production';
	/** Mount a fresh editor for `doc`; resolves once it is rendered (settled). */
	mount(doc: Document): Promise<void>;
	/** The mounted editor's session. */
	session(): any;
	/** Focus the editor canvas, like a click into the document. */
	focus(): void;
	/** Resolve once pending session changes are applied to the DOM, effects included. */
	settle(): Promise<void>;
	/** The element wrapping the editor (resized by the resize benchmark). */
	wrapper(): HTMLElement;
};

export type BenchId =
	'mount' | 'caret' | 'type' | 'enter' | 'resize' | 'scroll' | 'paste' | 'delete' | 'undo';

export type BenchDefinition = {
	id: BenchId;
	label: string;
	description: string;
};

/** The benchmarks, in the order they run on a freshly mounted document. */
export const BENCHES: BenchDefinition[] = [
	{
		id: 'mount',
		label: 'Initial render',
		description: 'Mount the editor with the generated document until it is rendered.'
	},
	{
		id: 'caret',
		label: 'Move caret',
		description: 'Move a text caret one character (selection-only change), per step.'
	},
	{
		id: 'type',
		label: 'Type a character',
		description: 'Insert one character with batching, like typing, per keystroke.'
	},
	{
		id: 'enter',
		label: 'Press Enter',
		description: 'Split the last text node (break_text_node command), per keystroke.'
	},
	{
		id: 'resize',
		label: 'Relayout on resize',
		description: 'Synchronous layout after changing the editor width, per step.'
	},
	{
		id: 'scroll',
		label: 'Scroll frame time',
		description: 'Frame duration while scrolling through the document in 1.5 s.'
	},
	{
		id: 'paste',
		label: 'Paste 100 paragraphs',
		description: 'Insert 100 paragraphs at the end of the body in one transaction.'
	},
	{
		id: 'delete',
		label: 'Delete 100 nodes',
		description: 'Delete the first 100 top-level nodes in one transaction.'
	},
	{
		id: 'undo',
		label: 'Undo the delete',
		description: 'Restore the 100 deleted nodes.'
	}
];

export type SuiteResult = {
	framework: Framework;
	mode: PerfHarness['mode'];
	node_count: number;
	/** Durations in ms per benchmark, one entry per measured step. */
	samples: Partial<Record<BenchId, number[]>>;
	/** Elements inside the editor after mounting (DOM overhead of the binding). */
	dom_elements: number;
	/** Problems detected while running, e.g. the DOM not reflecting a change. */
	warnings: string[];
};

// ===== Document generation =====

/**
 * A mixed document with `count` top-level nodes: about 60% paragraphs, 10%
 * headings, 10% stories with buttons, 5% lists, 5% image grids (the mix the
 * per-framework perf pages used).
 */
export function generate_perf_document(count: number): Document {
	const nodes: Record<string, DocumentNode> = {};
	const body: string[] = [];
	const text = (content: string) => ({ content, marks: [], annotations: [] });

	for (let i = 0; i < count; i++) {
		const id = nanoid();
		const mod = i % 20;
		if (mod === 5 || mod === 15) {
			const button_ids = [];
			for (let b = 0; b < 1 + (i % 3); b++) {
				const button_id = nanoid();
				nodes[button_id] = {
					id: button_id,
					type: 'button',
					content: text(`Action ${b + 1}`),
					href: '#'
				};
				button_ids.push(button_id);
			}
			nodes[id] = {
				id,
				type: 'story',
				layout: ['image-left', 'image-right', 'stacked'][i % 3],
				title: text(`Story ${body.length + 1}`),
				description: text(
					'A paragraph of description text for this story block, providing enough content to simulate real editorial use in production.'
				),
				image: '',
				buttons: { nodes: button_ids, marks: [], annotations: [] }
			};
		} else if (mod === 10) {
			const items = [];
			for (let j = 0; j < 4; j++) {
				const item_id = nanoid();
				nodes[item_id] = {
					id: item_id,
					type: 'list_item',
					content: text(`List item ${j + 1} with sample content`)
				};
				items.push(item_id);
			}
			nodes[id] = {
				id,
				type: 'list',
				list_items: { nodes: items, marks: [], annotations: [] },
				layout: 'decimal-leading-zero'
			};
		} else if (mod === 0 && i > 0) {
			const grid_items = [];
			for (let g = 0; g < 3; g++) {
				const grid_id = nanoid();
				nodes[grid_id] = {
					id: grid_id,
					type: 'image_grid_item',
					image: '',
					title: text(`Grid ${g + 1}`),
					description: text('Grid item description text')
				};
				grid_items.push(grid_id);
			}
			nodes[id] = {
				id,
				type: 'image_grid',
				image_grid_items: { nodes: grid_items, marks: [], annotations: [] }
			};
		} else {
			nodes[id] = {
				id,
				type: i % 10 === 0 ? 'heading_2' : 'paragraph',
				content: text(
					`Paragraph ${body.length + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`
				)
			};
		}
		body.push(id);
	}

	nodes['perf_page'] = {
		id: 'perf_page',
		type: 'page',
		body: { nodes: body, marks: [], annotations: [] },
		keywords: [],
		daily_visitors: [],
		created_at: new Date().toISOString()
	};
	return { document_id: 'perf_page', nodes };
}

// ===== Helpers =====

/** Next animation frame, falling back to a timeout where rAF is paused. */
function next_frame(): Promise<void> {
	return new Promise((resolve) => {
		const id = requestAnimationFrame(() => {
			clearTimeout(timer);
			resolve();
		});
		const timer = setTimeout(() => {
			cancelAnimationFrame(id);
			resolve();
		}, 50);
	});
}

/** Force a synchronous layout and return its duration in ms. */
function force_layout(): number {
	const t0 = performance.now();
	void document.documentElement.offsetHeight;
	return performance.now() - t0;
}

/** Let observers, timers and deferred work from the previous step finish. */
async function quiesce() {
	await next_frame();
	await next_frame();
	await new Promise((resolve) => setTimeout(resolve, 20));
}

/** Measure `op` plus the framework's DOM update, in ms. */
async function measure(harness: PerfHarness, op: () => void): Promise<number> {
	const t0 = performance.now();
	op();
	await harness.settle();
	return performance.now() - t0;
}

function body_path(session: any): DocumentPath {
	return [session.document_id, 'body'];
}

/** Path of the content property of the last text node in the body. */
function last_text_path(session: any): DocumentPath {
	const nodes: string[] = session.get(body_path(session)).nodes;
	for (let i = nodes.length - 1; i >= 0; i--) {
		if (session.kind(session.get(nodes[i])) === 'text') {
			return [...body_path(session), i, 'content'];
		}
	}
	throw new Error('No text node in the document body');
}

function text_element(harness: PerfHarness, path: DocumentPath): HTMLElement | null {
	return harness
		.wrapper()
		.querySelector<HTMLElement>(`[data-path="${serialize_path(path)}"][data-type="text"]`);
}

// ===== The suite =====

/**
 * Mount a fresh document with `node_count` nodes and run the benchmarks in
 * order (they build on each other: paste adds nodes, delete removes them,
 * undo restores them).
 */
export async function run_suite(
	harness: PerfHarness,
	node_count: number,
	bench_ids: BenchId[] = BENCHES.map((bench) => bench.id)
): Promise<SuiteResult> {
	const enabled = new Set(bench_ids);
	const samples: SuiteResult['samples'] = {};
	const warnings: string[] = [];
	const record = (id: BenchId, value: number) => {
		(samples[id] ??= []).push(Math.round(value * 1000) / 1000);
	};

	// Initial render
	const doc = generate_perf_document(node_count);
	const t0 = performance.now();
	await harness.mount(doc);
	const mount_ms = performance.now() - t0;
	if (enabled.has('mount')) record('mount', mount_ms);
	const dom_elements = harness.wrapper().querySelectorAll('*').length;
	if (dom_elements < 10) warnings.push(`mount: only ${dom_elements} elements rendered`);
	await quiesce();

	const session = harness.session();
	harness.focus();
	await harness.settle();

	// Caret moves (selection only)
	if (enabled.has('caret')) {
		const path = last_text_path(session);
		for (let offset = 0; offset < 30; offset++) {
			record(
				'caret',
				await measure(harness, () => {
					session.selection = { type: 'text', path, anchor_offset: offset, focus_offset: offset };
				})
			);
		}
		const anchor = window.getSelection()?.anchorNode;
		const element = text_element(harness, path);
		if (!anchor || !element?.contains(anchor)) {
			warnings.push('caret: the DOM selection was not rendered into the text node after settle()');
		}
		await quiesce();
	}

	// Typing
	if (enabled.has('type')) {
		const path = last_text_path(session);
		const length = session.get(path).content.length;
		session.selection = { type: 'text', path, anchor_offset: length, focus_offset: length };
		await harness.settle();
		for (let i = 0; i < 30; i++) {
			record(
				'type',
				await measure(harness, () => {
					const tr = session.tr;
					tr.insert_text('x');
					session.apply(tr, { batch: true });
				})
			);
		}
		if (!text_element(harness, path)?.textContent?.includes('x'.repeat(30))) {
			warnings.push('type: the DOM did not show the typed text after settle()');
		}
		await quiesce();
	}

	// Enter
	if (enabled.has('enter')) {
		const path = last_text_path(session);
		const length = session.get(path).content.length;
		session.selection = { type: 'text', path, anchor_offset: length, focus_offset: length };
		await harness.settle();
		const before = session.get(body_path(session)).nodes.length;
		for (let i = 0; i < 20; i++) {
			record('enter', await measure(harness, () => session.commands.break_text_node.execute()));
		}
		if (session.get(body_path(session)).nodes.length !== before + 20) {
			warnings.push('enter: break_text_node did not add a node per keystroke');
		}
		await quiesce();
	}

	// Resize (synchronous relayout)
	if (enabled.has('resize')) {
		const wrapper = harness.wrapper();
		for (let i = 0; i < 20; i++) {
			wrapper.style.maxWidth = i % 2 === 0 ? '600px' : '1000px';
			record('resize', force_layout());
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		wrapper.style.maxWidth = '';
		force_layout();
		await quiesce();
	}

	// Scroll frame times
	if (enabled.has('scroll')) {
		const root = document.scrollingElement ?? document.documentElement;
		root.scrollTop = 0;
		await quiesce();
		const max_scroll = root.scrollHeight - window.innerHeight;
		if (max_scroll <= 0) {
			warnings.push('scroll: the document is not taller than the viewport');
		} else {
			const duration = 1500;
			let previous: number | null = null;
			const start = performance.now();
			await new Promise<void>((resolve) => {
				function step(now: number) {
					if (previous !== null) record('scroll', now - previous);
					previous = now;
					const progress = Math.min((now - start) / duration, 1);
					root.scrollTop = progress * max_scroll;
					if (progress < 1) requestAnimationFrame(step);
					else resolve();
				}
				requestAnimationFrame(step);
			});
		}
		root.scrollTop = 0;
		await quiesce();
	}

	// Paste 100 paragraphs at the end of the body
	if (enabled.has('paste')) {
		const path = body_path(session);
		const length = session.get(path).nodes.length;
		session.selection = { type: 'node', path, anchor_offset: length, focus_offset: length };
		await harness.settle();
		const pasted: Record<string, DocumentNode> = {};
		const pasted_ids: string[] = [];
		for (let i = 0; i < 100; i++) {
			const id = `paste_src_${i}`;
			pasted[id] = {
				id,
				type: 'paragraph',
				content: {
					content: `Pasted paragraph ${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.`,
					marks: [],
					annotations: []
				}
			};
			pasted_ids.push(id);
		}
		record(
			'paste',
			await measure(harness, () => {
				const tr = session.tr;
				tr.insert_nodes(pasted_ids.map((id) => tr.build(id, pasted)));
				session.apply(tr);
			})
		);
		if (session.get(path).nodes.length !== length + 100) {
			warnings.push('paste: the body did not grow by 100 nodes');
		}
		await quiesce();
	}

	// Delete the first 100 nodes, then undo
	if (enabled.has('delete') || enabled.has('undo')) {
		const path = body_path(session);
		const length = session.get(path).nodes.length;
		const count = Math.min(100, length - 1);
		session.selection = { type: 'node', path, anchor_offset: 0, focus_offset: count };
		await harness.settle();
		const delete_ms = await measure(harness, () => session.apply(session.tr.delete_selection()));
		if (enabled.has('delete')) record('delete', delete_ms);
		await quiesce();
		const undo_ms = await measure(harness, () => session.undo());
		if (enabled.has('undo')) record('undo', undo_ms);
		if (session.get(path).nodes.length !== length) {
			warnings.push('undo: the deleted nodes were not restored');
		}
		await quiesce();
	}

	return {
		framework: harness.framework,
		mode: harness.mode,
		node_count,
		samples,
		dom_elements,
		warnings
	};
}

// ===== Wiring =====

export type PerfHarnessHandle = {
	framework: Framework;
	mode: PerfHarness['mode'];
	run_suite: (node_count: number, bench_ids?: BenchId[]) => Promise<SuiteResult>;
};

/** What the comparison page publishes when a run finishes (read by `pnpm perftest`). */
export type PerfReport = {
	error: string | null;
	results: SuiteResult[];
	markdown: string;
};

declare global {
	interface Window {
		__svedit_perf?: PerfHarnessHandle;
		__svedit_perf_report?: PerfReport;
	}
}

/** Expose a harness to the comparison page (and to `pnpm perftest`). */
export function install_harness(harness: PerfHarness): () => void {
	window.__svedit_perf = {
		framework: harness.framework,
		mode: harness.mode,
		run_suite: (node_count, bench_ids) => run_suite(harness, node_count, bench_ids)
	};
	return () => {
		delete window.__svedit_perf;
	};
}
