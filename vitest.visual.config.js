import { defineConfig } from 'vitest/config';
import { preview } from '@vitest/browser-preview';
import { sveltekit } from '@sveltejs/kit/vite';

// Visual / debugging config: runs tests in the user's actual default
// browser via the @vitest/browser-preview provider. Use `npm run test:visual`
// when you want to watch tests run and use your own DevTools.
//
// Caution: every invocation opens a new tab and does NOT close it when
// done. Don't run repeatedly — switch to `npm test` for batch runs.
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		browser: {
			provider: preview(),
			enabled: true,
			instances: [{ browser: 'chromium' }]
		}
	},
	clearMocks: true,
	include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
	exclude: ['src/lib/server/**']
});
