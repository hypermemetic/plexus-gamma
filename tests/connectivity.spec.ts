/**
 * Basic backend connectivity checks.
 * These run before all other tests and fail fast with a clear message
 * if the substrate backend is unreachable.
 */

import { test, expect } from '@playwright/test'

const WS_URL = 'ws://127.0.0.1:4444'

// ─── Raw WebSocket connectivity ───────────────────────────────────────────────

test('substrate is reachable on ws://127.0.0.1:4444', async ({ page }) => {
  const connected = await page.evaluate((url) => {
    return new Promise<boolean>((resolve) => {
      const ws = new WebSocket(url)
      ws.onopen  = () => { ws.close(); resolve(true) }
      ws.onerror = () => resolve(false)
      setTimeout(() => resolve(false), 5_000)
    })
  }, WS_URL)

  expect(connected, `Could not open WebSocket to ${WS_URL} — is substrate running?`).toBe(true)
})

// ─── App loads and tree renders ───────────────────────────────────────────────

test('app loads and shows plugin tree', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.loading-state')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 15_000 })
})

test('substrate backend label is visible in sidebar', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.backend-label')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.backend-label')).toContainText('substrate')
})

// ─── Known plugins exist ──────────────────────────────────────────────────────

test('echo plugin is present in the tree', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.node-row', { hasText: 'echo' }).first())
    .toBeVisible({ timeout: 15_000 })
})

test('claudecode plugin is present in the tree', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.node-row', { hasText: 'claudecode' }).first())
    .toBeVisible({ timeout: 15_000 })
})
