import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/**
 * `pnpm dev:site` (scripts/dev_site.mjs) runs all three demos behind this
 * dev server: /react/ and /vue/ are proxied (HMR websockets included) to the
 * React and Vue Vite dev servers, whose ports the script passes in. Without
 * the env vars (`pnpm dev` inside this package) no proxy is configured.
 */
const site_proxy = {};
if (process.env.SVEDIT_REACT_PORT) {
	site_proxy['/react'] = {
		target: `http://localhost:${process.env.SVEDIT_REACT_PORT}`,
		ws: true
	};
}
if (process.env.SVEDIT_VUE_PORT) {
	site_proxy['/vue'] = { target: `http://localhost:${process.env.SVEDIT_VUE_PORT}`, ws: true };
}

export default defineConfig({
	// Explicit output paths: without options adapter-static switches to its
	// zero-config mode on Vercel and writes to .vercel/output instead, while
	// scripts/build_site.mjs expects the static site in build/.
	plugins: [sveltekit({ adapter: adapter({ pages: 'build', assets: 'build' }) })],
	server: { proxy: site_proxy },
	resolve: {
		alias: [
			{ find: /^svedit$/, replacement: fileURLToPath(new URL('./src/lib', import.meta.url)) },
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
	test: { fileParallelism: false, setupFiles: ['./src/test/setup.ts'] },
	build: { sourcemap: true },
	css: { devSourcemap: true }
});
