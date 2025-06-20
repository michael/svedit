import { sveltekit } from '@sveltejs/kit/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		projects: [
			{
				// NOTE: Here we only use the Svelte plugin, not Sveltekit for more isolated component tests
				// extends: './vite.config.js',
				plugins: [svelte()],
				test: {
					name: 'client',
					environment: 'browser',
					browser: {
						enabled: true,
						// NOTE: We don't need play
						// provider: 'playwright',
						instances: [{
							browser: 'chromium',
						}],
					},
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
				}
			},
			{
				extends: './vite.config.js',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
				}
			}
		]
	},
});
