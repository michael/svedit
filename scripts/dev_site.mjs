/**
 * Runs the whole demo site in dev mode on one origin, with hot reload:
 *
 *   http://localhost:5173/        Svelte (SvelteKit dev server)
 *   http://localhost:5173/react/  React (proxied to the React Vite server)
 *   http://localhost:5173/vue/    Vue    (proxied to the Vue Vite server)
 *   http://localhost:5173/solid/  Solid  (proxied to the Solid Vite server)
 *
 * The framework switcher at the top of each demo works exactly as in the
 * deployed site. The React, Vue and Solid servers already serve under
 * /react/, /vue/ and /solid/ (vite `base`), so the SvelteKit server just
 * proxies those prefixes
 * (see packages/svelte/vite.config.js).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const site_port = Number(process.env.PORT ?? 5173);
const react_port = site_port + 1;
const vue_port = site_port + 2;
const solid_port = site_port + 3;

const servers = [
	{ name: 'react', filter: '@svedit/react', port: react_port, color: '\x1b[36m' },
	{ name: 'vue', filter: '@svedit/vue', port: vue_port, color: '\x1b[32m' },
	{ name: 'solid', filter: '@svedit/solid', port: solid_port, color: '\x1b[34m' },
	{
		name: 'svelte',
		filter: 'svedit',
		port: site_port,
		color: '\x1b[33m',
		env: {
			SVEDIT_REACT_PORT: String(react_port),
			SVEDIT_VUE_PORT: String(vue_port),
			SVEDIT_SOLID_PORT: String(solid_port)
		}
	}
];

const children = servers.map((server) => {
	const child = spawn(
		'pnpm',
		['--filter', server.filter, 'dev', '--port', String(server.port), '--strictPort'],
		{
			cwd: root,
			env: { ...process.env, ...server.env, FORCE_COLOR: '1' },
			stdio: ['ignore', 'pipe', 'pipe'],
			// Each server gets its own process group: pnpm spawns vite as a
			// grandchild, and a signal sent to pnpm alone leaves vite running on
			// its port (reparented to PID 1) after this script exits.
			detached: true
		}
	);
	const prefix = `${server.color}[${server.name}]\x1b[0m `;
	const forward = (stream) => (chunk) => {
		for (const line of chunk.toString().split('\n')) {
			if (line.trim()) stream.write(prefix + line + '\n');
		}
	};
	child.stdout.on('data', forward(process.stdout));
	child.stderr.on('data', forward(process.stderr));
	child.on('exit', (code) => {
		if (code !== null && code !== 0) {
			console.error(`${prefix}exited with code ${code}`);
			shutdown(code);
		}
	});
	return child;
});

let shutting_down = false;
function shutdown(code = 0) {
	if (shutting_down) return;
	shutting_down = true;
	for (const child of children) {
		// Negative pid: the whole process group (pnpm and the vite it spawned).
		try {
			process.kill(-child.pid, 'SIGTERM');
		} catch {
			child.kill('SIGTERM');
		}
	}
	setTimeout(() => process.exit(code), 200);
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
process.on('SIGHUP', () => shutdown());

setTimeout(() => {
	console.log(
		`\n  site: http://localhost:${site_port}/   react: http://localhost:${site_port}/react/   vue: http://localhost:${site_port}/vue/   solid: http://localhost:${site_port}/solid/\n`
	);
}, 1500);
