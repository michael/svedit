import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit({ adapter: adapter() })],
	resolve: { alias: { svedit: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
	test: { fileParallelism: false, setupFiles: ['./src/test/setup.ts'] },
	build: { sourcemap: true },
	css: { devSourcemap: true }
});
