/**
 * Aggregates benchmark runs from all frameworks into comparison rows and a
 * Markdown table. Used by the comparison page and `pnpm perftest`.
 */
import { BENCHES } from './suite.js';
import type { BenchId, Framework, SuiteResult } from './suite.js';

export const FRAMEWORKS: Framework[] = ['Svelte', 'React', 'Vue'];

export type Cell = { median: number; p95: number; samples: number };

export type ComparisonRow = {
	bench: BenchId;
	label: string;
	node_count: number;
	cells: Partial<Record<Framework, Cell>>;
	/** Framework with the lowest median, when the difference is meaningful. */
	fastest: Framework | null;
};

function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return NaN;
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
	return sorted[index];
}

function cell(values: number[]): Cell {
	const sorted = [...values].sort((a, b) => a - b);
	return { median: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), samples: sorted.length };
}

/** Groups all samples by benchmark, node count and framework. */
export function summarize(results: SuiteResult[]): ComparisonRow[] {
	const node_counts = [...new Set(results.map((result) => result.node_count))].sort(
		(a, b) => a - b
	);
	const rows: ComparisonRow[] = [];
	for (const bench of BENCHES) {
		for (const node_count of node_counts) {
			const cells: ComparisonRow['cells'] = {};
			for (const framework of FRAMEWORKS) {
				const values = results
					.filter((r) => r.framework === framework && r.node_count === node_count)
					.flatMap((r) => r.samples[bench.id] ?? []);
				if (values.length > 0) cells[framework] = cell(values);
			}
			const present = FRAMEWORKS.filter((framework) => cells[framework]);
			if (present.length === 0) continue;
			const sorted = [...present].sort((a, b) => cells[a].median - cells[b].median);
			// Only call a winner when it is at least 5% ahead of the runner-up.
			const fastest =
				sorted.length > 1 && cells[sorted[0]].median < cells[sorted[1]].median * 0.95
					? sorted[0]
					: null;
			rows.push({ bench: bench.id, label: bench.label, node_count, cells, fastest });
		}
	}
	return rows;
}

/** Average element count inside the editor after mounting, per framework and size. */
export function dom_sizes(results: SuiteResult[]) {
	const sizes: Record<number, Partial<Record<Framework, number>>> = {};
	for (const result of results) {
		const entry = (sizes[result.node_count] ??= {});
		entry[result.framework] = result.dom_elements;
	}
	return sizes;
}

export function format_ms(value: number): string {
	if (!Number.isFinite(value)) return '–';
	if (value >= 100) return value.toFixed(0);
	if (value >= 10) return value.toFixed(1);
	return value.toFixed(2);
}

export type ReportMeta = {
	mode: string;
	rounds: number;
	user_agent: string;
	date: string;
};

/** The comparison as a Markdown table (median, p95 in parentheses). */
export function to_markdown(results: SuiteResult[], meta: ReportMeta): string {
	const rows = summarize(results);
	const lines = [
		`Svedit performance: Svelte vs React vs Vue`,
		``,
		`${meta.mode} build, ${meta.rounds} round(s), ${meta.date}`,
		`${meta.user_agent}`,
		``,
		`Median ms per step (p95 in parentheses), lower is better. **Bold**: at least 5% faster than the others.`,
		``,
		`| Benchmark | Nodes | ${FRAMEWORKS.join(' | ')} |`,
		`| --- | ---: | ${FRAMEWORKS.map(() => '---:').join(' | ')} |`
	];
	for (const row of rows) {
		const cells = FRAMEWORKS.map((framework) => {
			const c = row.cells[framework];
			if (!c) return '–';
			const text = `${format_ms(c.median)} (${format_ms(c.p95)})`;
			return row.fastest === framework ? `**${text}**` : text;
		});
		lines.push(`| ${row.label} | ${row.node_count} | ${cells.join(' | ')} |`);
	}
	const sizes = dom_sizes(results);
	lines.push('', `| DOM elements after mount | Nodes | ${FRAMEWORKS.join(' | ')} |`);
	lines.push(`| --- | ---: | ${FRAMEWORKS.map(() => '---:').join(' | ')} |`);
	for (const [node_count, by_framework] of Object.entries(sizes)) {
		lines.push(
			`| | ${node_count} | ${FRAMEWORKS.map((f) => by_framework[f] ?? '–').join(' | ')} |`
		);
	}
	const warnings = results.flatMap((r) =>
		r.warnings.map((w) => `${r.framework} (${r.node_count} nodes): ${w}`)
	);
	if (warnings.length > 0) {
		lines.push('', 'Warnings:', ...[...new Set(warnings)].map((w) => `- ${w}`));
	}
	return lines.join('\n');
}
