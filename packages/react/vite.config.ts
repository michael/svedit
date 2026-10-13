import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// Served at /react/ next to the Svelte (/) and Vue (/vue/) demos.
	base: '/react/',
	plugins: [react()],
	resolve: {
		alias: [
			{
				find: /^@svedit\/react$/,
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
	test: { fileParallelism: false, setupFiles: ['./src/test/setup.ts'] },
	// The demo builds to build/, so it never wipes the library output in dist/
	// (vite.config.lib.ts), which is what gets published.
	build: { outDir: 'build', sourcemap: true },
	css: { devSourcemap: true }
});
