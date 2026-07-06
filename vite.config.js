import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		fileParallelism: false,
		setupFiles: ['./src/test/setup.js']
	},
	build: {
		sourcemap: true
	},
	css: {
		devSourcemap: true
	}
});
