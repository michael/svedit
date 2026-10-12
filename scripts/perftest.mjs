/**
 * Runs the Svelte/React/Vue performance comparison headless and prints the
 * result table:
 *
 *   pnpm perftest                          build the site, run, print
 *   pnpm perftest --no-build               reuse the existing site/ build
 *   pnpm perftest --nodes 200,1000 --rounds 5 --benches type,enter
 *   pnpm perftest --json results.json      also write the raw samples
 *
 * It serves the production build (site/, like Vercel), opens /perftest?auto
 * in headless Chromium (Playwright) and waits for the page's report. Needs
 * Playwright's Chromium once: cd packages/core && pnpm exec playwright install chromium
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => {
	const index = args.indexOf(`--${name}`);
	return index === -1 ? undefined : args[index + 1];
};

const nodes = option('nodes') ?? '200,1000,3000';
const rounds = option('rounds') ?? '3';
const benches = option('benches');
const json_path = option('json');

if (!args.includes('--no-build')) {
	console.log('Building the site (pass --no-build to reuse site/)…');
	const build = spawnSync('node', [join(root, 'scripts/build_site.mjs')], {
		cwd: root,
		stdio: ['ignore', 'ignore', 'inherit']
	});
	if (build.status !== 0) process.exit(build.status ?? 1);
} else if (!existsSync(join(root, 'site'))) {
	console.error('No site/ build found. Run without --no-build, or run pnpm build:site first.');
	process.exit(1);
}

function free_port() {
	return new Promise((resolve) => {
		const server = createServer();
		server.listen(0, () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

const port = await free_port();
const server = spawn('node', [join(root, 'scripts/serve_site.mjs')], {
	cwd: root,
	env: { ...process.env, PORT: String(port) },
	stdio: ['ignore', 'pipe', 'inherit']
});
await new Promise((resolve, reject) => {
	server.stdout.on('data', (chunk) => {
		if (String(chunk).includes('site:')) resolve();
	});
	server.on('exit', (code) => reject(new Error(`site server exited with code ${code}`)));
});

const browser = await chromium.launch();
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	page.on('console', (message) => {
		const text = message.text();
		if (text.startsWith('[perftest]')) console.log(text.slice('[perftest] '.length));
	});
	page.on('pageerror', (err) => console.error(`page error: ${err.message}`));
	const query = new URLSearchParams({ auto: '', nodes, rounds });
	if (benches) query.set('benches', benches);
	await page.goto(`http://localhost:${port}/perftest?${query}`);
	await page.waitForFunction(() => window.__svedit_perf_report, null, { timeout: 30 * 60_000 });
	const report = await page.evaluate(() => window.__svedit_perf_report);
	console.log(`\n${report.markdown}\n`);
	if (json_path) {
		writeFileSync(json_path, JSON.stringify(report.results, null, 2));
		console.log(`Raw samples written to ${json_path}`);
	}
	if (report.error) {
		console.error(report.error);
		process.exitCode = 1;
	}
} finally {
	await browser.close();
	server.kill();
}
