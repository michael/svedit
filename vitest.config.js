import { defineConfig, mergeConfig } from 'vitest/config';
import { preview } from '@vitest/browser-preview';
import vite_config from './vite.config.js';

export default mergeConfig(
	vite_config,
	defineConfig({
		test: {
			browser: {
				provider: preview(),
				enabled: true,
				// at least one instance is required
				instances: [{ browser: 'chromium' }]
			},
			clearMocks: true,
			include: ['src/**/*.svelte.{test,spec}.{js,ts}']
		}
	})
);
