import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Library build: bundles src/lib into dist/index.js (ESM, react external) and
 * extracts the component styles into dist/svedit.css. Type declarations are
 * emitted separately by tsc (see the build:lib script).
 */
export default defineConfig({
	plugins: [react()],
	build: {
		lib: {
			entry: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
			formats: ['es'],
			fileName: 'index',
			cssFileName: 'svedit'
		},
		rollupOptions: {
			external: ['@svedit/core', 'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']
		},
		sourcemap: true,
		emptyOutDir: true
	}
});
