import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

/**
 * Library build: bundles src/lib into dist/index.js (ESM, vue external) and
 * extracts the component styles into dist/svedit.css. Type declarations are
 * emitted separately by vue-tsc (see the build:lib script).
 */
export default defineConfig({
	plugins: [vue()],
	build: {
		lib: {
			entry: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
			formats: ['es'],
			fileName: 'index',
			cssFileName: 'svedit'
		},
		rollupOptions: {
			external: ['@svedit/core', 'vue']
		},
		sourcemap: true,
		emptyOutDir: true
	}
});
