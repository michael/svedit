import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// Served at /solid/ next to the Svelte (/), React (/react/) and Vue (/vue/) demos.
	base: '/solid/',
	plugins: [solid()],
	resolve: {
		alias: [
			{
				find: /^@svedit\/solid$/,
				replacement: fileURLToPath(new URL('./src/lib', import.meta.url))
			},
			// The core is consumed from source in dev and tests (no build step).
			{
				find: /^@svedit\/core$/,
				replacement: fileURLToPath(new URL('../core/src/lib/index.ts', import.meta.url))
			},
			{
				find: /^@svedit\/core\/(.*)$/,
				replacement: fileURLToPath(new URL('../core/', import.meta.url)) + '$1'
			}
		]
	},
	server: {
		// Enables the JS self-profiling API (used by the perftest lab) on dev-served pages.
		headers: { 'Document-Policy': 'js-profiling' }
	},
	test: {
		// The suites run in the browser (vitest.config.ts). Set an environment
		// explicitly: otherwise vite-plugin-solid defaults it to 'jsdom', which
		// is not installed, and vitest then exits with code 1 after the run.
		environment: 'node',
		fileParallelism: false,
		setupFiles: ['./src/test/setup.ts']
	},
	// The demo builds to build/, so it never wipes the library output in dist/
	// (vite.config.lib.ts), which is what gets published.
	build: { outDir: 'build', sourcemap: true },
	css: { devSourcemap: true }
});
