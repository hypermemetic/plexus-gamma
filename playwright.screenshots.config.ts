import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for screenshot capture only.
 * Usage: bun run screenshots
 *
 * Screenshots are saved to docs/screenshots/ and referenced in README.md.
 * Run after `bun run dev` is already running, or let the webServer start it.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/screenshots.spec.ts'],
  fullyParallel: false, // run in order so screenshots are numbered consistently
  retries: 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:8081',
    trace: 'off',
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:8081',
    reuseExistingServer: true,
    timeout: 15_000,
  },
})
