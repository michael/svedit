import { defineConfig } from 'vitest/config';
import { preview } from '@vitest/browser-preview';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		browser: {
			provider: preview(),
			enabled: true,
			// at least one instance is required
			instances: [{ browser: 'chromium' }]
		}
	},
	clearMocks: true,
	include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
	exclude: ['src/lib/server/**']
});
