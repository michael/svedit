import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  test: {
    browser: {
      // NOTE: We don't need playwright, we just open the real Chrome
      // provider: 'playwright', // or 'webdriverio'
      enabled: true,
      // at least one instance is required
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
  clearMocks: true,
  include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
  exclude: ['src/lib/server/**'],
});
