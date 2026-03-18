/**
 * Playwright config for RPC integration tests.
 *
 * These tests exercise the full synapse-protocol path:
 *   Node.js ws client → plexus-rpc server → bridge → test browser
 *
 * Run with: bun run test:rpc
 *
 * The bridge is a last-wins singleton, so tests must run with a single
 * worker to avoid competing browser connections stealing the bridge slot.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/rpc-integration.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
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
