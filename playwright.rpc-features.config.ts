/**
 * Playwright config for the RPC feature showcase / doc generator.
 *
 * Identical constraints as the RPC integration config:
 * - Serial (single worker): bridge is a last-wins singleton
 * - Reuses existing dev server if running
 *
 * Run: bun run docs:rpc
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:        './tests',
  testMatch:      ['**/rpc-features.spec.ts'],
  fullyParallel:  false,
  workers:        1,
  retries:        0,
  reporter:       'list',

  use: {
    baseURL: 'http://localhost:8081',
    trace:   'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command:             'bun run dev',
    url:                 'http://localhost:8081',
    reuseExistingServer: true,
    timeout:             20_000,
  },
})
