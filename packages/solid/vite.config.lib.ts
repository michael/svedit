import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vite';

/**
 * Library build: bundles src/lib into dist/index.js (ESM, solid-js external)
 * and extracts the component styles into dist/svedit.css. Type declarations
 * are emitted separately by tsc (see the build:lib script).
 */
export default defineConfig({
	plugins: [solid()],
	build: {
		lib: {
			entry: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
			formats: ['es'],
			fileName: 'index',
			cssFileName: 'svedit'
		},
		rollupOptions: {
			external: ['@svedit/core', /^solid-js(\/.*)?$/]
		},
		sourcemap: true,
		emptyOutDir: true
	}
});
