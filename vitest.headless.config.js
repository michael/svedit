import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

// Headless playwright config. Used by `npm run test:headless`, which is
// what AI agents should call when running the test suite — runs in a
// background browser, no tabs in the user's real browser, no focus
// stealing. Humans keep using `npm test` (preview provider in their
// real browser).
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		browser: {
			provider: playwright(),
			enabled: true,
			headless: true,
			instances: [{ browser: 'chromium' }]
		}
	},
	clearMocks: true,
	include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
	exclude: ['src/lib/server/**']
});
