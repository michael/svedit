/**
 * Builds the three demo apps and assembles them into one static site:
 *
 *   site/        <- packages/svelte/build  (Svedit, served at /)
 *   site/react/  <- packages/react/build   (React, served at /react/)
 *   site/vue/    <- packages/vue/build     (Vue, served at /vue/)
 *
 * Vercel (see vercel.json) deploys the `site` directory as-is.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const site = join(root, 'site');

const apps = [
	{ filter: 'svedit', output: join(root, 'packages/svelte/build'), target: site },
	{ filter: '@svedit/react', output: join(root, 'packages/react/build'), target: join(site, 'react') },
	{ filter: '@svedit/vue', output: join(root, 'packages/vue/build'), target: join(site, 'vue') }
];

for (const app of apps) {
	console.log(`\n▶ building ${app.filter}`);
	const result = spawnSync('pnpm', ['--filter', app.filter, 'build'], {
		cwd: root,
		stdio: 'inherit'
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
	if (!existsSync(app.output)) {
		console.error(`expected build output at ${app.output}`);
		process.exit(1);
	}
}

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
for (const app of apps) {
	mkdirSync(app.target, { recursive: true });
	cpSync(app.output, app.target, { recursive: true });
	console.log(`✓ ${app.filter} -> ${app.target.replace(root + '/', '')}/`);
}
