import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

// Default config: headless playwright. No browser tabs in the user's
// real browser, no focus stealing, safe to run in batch / from CI / from
// AI agents. For the interactive "watch tests in my real browser" mode,
// use `npm run test:visual` (which loads vitest.visual.config.js).
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		browser: {
			provider: 'playwright',
			enabled: true,
			headless: true,
			instances: [{ browser: 'chromium' }]
		}
	},
	clearMocks: true,
	include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
	exclude: ['src/lib/server/**']
});
