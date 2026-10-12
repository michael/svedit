import { env } from 'node:process';
import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { preview } from '@vitest/browser-preview';
import vite_config from './vite.config.js';

// Locally the suites run in the browser you have open (preview provider). On
// CI there is no display and the preview provider refuses headless mode, so
// the same suites run in a headless Chromium driven by Playwright instead
// (the browser is installed with `playwright install chromium`, see
// .github/workflows/ci.yml).
const is_ci = Boolean(env.CI);

export default mergeConfig(
	vite_config,
	defineConfig({
		test: {
			browser: {
				provider: is_ci ? playwright() : preview(),
				headless: is_ci,
				enabled: true,
				// at least one instance is required
				instances: [{ browser: 'chromium' }]
			},
			clearMocks: true,
			include: ['src/**/*.{test,spec}.ts']
		}
	})
);
