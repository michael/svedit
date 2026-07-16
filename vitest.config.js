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
		},
		// include is a test option — vitest ignores it at the config top
		// level. Anchored to src/ so stray test-file copies (e.g. under
		// .claude/worktrees/) never enter the run.
		include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
		clearMocks: true
	}
});
