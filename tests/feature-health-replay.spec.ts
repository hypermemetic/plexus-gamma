/**
 * Feature tests for:
 *   - Health Dashboard (HealthDashboard.vue)
 *   - Replay Panel    (ReplayPanel.vue + useInvocationHistory)
 *
 * Prerequisites (already running in dev environment):
 *   - substrate on ws://127.0.0.1:4444
 */

import { test, expect, type Page } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForTree(page: Page) {
  await expect(page.locator('.loading-state')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 15_000 })
}

// ─── Health Dashboard ─────────────────────────────────────────────────────────

test.describe('health dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
  })

  test('health strip is visible in conn-bar', async ({ page }) => {
    await expect(page.locator('.health-chip').first()).toBeVisible({ timeout: 10_000 })
  })

  test('health strip shows substrate backend', async ({ page }) => {
    const chip = page.locator('.health-chip', { hasText: 'substrate' })
    await expect(chip).toBeVisible({ timeout: 10_000 })
  })

  test('health strip dot is green for connected backend', async ({ page }) => {
    // The substrate backend should be reachable → status 'ok' → .dot-ok on the status dot
    const chip = page.locator('.health-chip', { hasText: 'substrate' })
    await expect(chip).toBeVisible({ timeout: 10_000 })
    const dot = chip.locator('.status-dot')
    await expect(dot).toHaveClass(/dot-ok/, { timeout: 10_000 })
  })

  test('clicking a health chip opens the dashboard', async ({ page }) => {
    const chip = page.locator('.health-chip').first()
    await expect(chip).toBeVisible({ timeout: 10_000 })
    await chip.click()
    await expect(page.locator('.dashboard-backdrop')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.dashboard-panel')).toBeVisible({ timeout: 10_000 })
  })

  test('expanded dashboard shows backend name', async ({ page }) => {
    await page.locator('.health-chip').first().click()
    await expect(page.locator('.dashboard-panel')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.card-name', { hasText: 'substrate' })).toBeVisible()
  })

  test('expanded dashboard shows hash', async ({ page }) => {
    await page.locator('.health-chip').first().click()
    await expect(page.locator('.dashboard-panel')).toBeVisible({ timeout: 10_000 })
    // hash-badge shows first 8 chars of the current hash; it may not exist if no hash
    // has been received yet — wait a moment and check
    const badge = page.locator('.hash-badge').first()
    // The badge only renders when h.hashCurrent is set. Give the health monitor time.
    await expect(badge).toBeVisible({ timeout: 10_000 })
    const text = await badge.textContent()
    expect(text).toBeTruthy()
    expect(text!.trim().length).toBe(8)
  })

  test('expanded dashboard shows latency stats', async ({ page }) => {
    // Wait for at least one health tick so latency data is present
    await page.locator('.health-chip').first().click()
    await expect(page.locator('.dashboard-panel')).toBeVisible({ timeout: 10_000 })
    // The latency row renders .lat-stat spans with text "avg …ms", "p50 …ms", "p95 …ms"
    const latStats = page.locator('.lat-stat')
    await expect(latStats.first()).toBeVisible({ timeout: 10_000 })
    const texts = await latStats.allTextContents()
    const combined = texts.join(' ')
    const hasLatencyText = combined.includes('avg') || combined.includes('p50')
    expect(hasLatencyText).toBe(true)
  })

  test('expanded dashboard shows call count', async ({ page }) => {
    await page.locator('.health-chip').first().click()
    await expect(page.locator('.dashboard-panel')).toBeVisible({ timeout: 10_000 })
    // The calls row has a row-label "calls:" inside a .card-row
    await expect(page.locator('.card-row', { hasText: 'calls:' }).first()).toBeVisible()
  })

  test('expanded dashboard shows sparkline svg', async ({ page }) => {
    await page.locator('.health-chip').first().click()
    await expect(page.locator('.dashboard-panel')).toBeVisible({ timeout: 10_000 })
    // Sparkline row + svg are only rendered when latencies.length > 0.
    // Give the health monitor time to record some latency samples.
    const sparkline = page.locator('.sparkline')
    await expect(sparkline.first()).toBeVisible({ timeout: 10_000 })
  })

  test('closing the dashboard hides it', async ({ page }) => {
    await page.locator('.health-chip').first().click()
    await expect(page.locator('.dashboard-panel')).toBeVisible({ timeout: 10_000 })
    await page.locator('.close-btn').click()
    await expect(page.locator('.dashboard-backdrop')).toHaveCount(0, { timeout: 5_000 })
    await expect(page.locator('.dashboard-panel')).toHaveCount(0)
  })

  test('clicking backdrop closes dashboard', async ({ page }) => {
    await page.locator('.health-chip').first().click()
    await expect(page.locator('.dashboard-backdrop')).toBeVisible({ timeout: 10_000 })
    // Click on the backdrop itself (not the panel) — the .self modifier means only a direct
    // click on .dashboard-backdrop triggers close.  Click near the top-left corner.
    await page.locator('.dashboard-backdrop').click({ position: { x: 10, y: 10 } })
    await expect(page.locator('.dashboard-backdrop')).toHaveCount(0, { timeout: 5_000 })
  })
})

// ─── Replay Panel ─────────────────────────────────────────────────────────────

test.describe('replay panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
    // Clear localStorage so history is empty at the start of every test
    await page.evaluate(() => localStorage.removeItem('plexus-gamma:history'))
  })

  test('replay button is visible in conn-bar', async ({ page }) => {
    // The replay button has title="Invocation history" and uses the palette-trigger class
    await expect(page.locator('[title="Invocation history"]')).toBeVisible()
  })

  test('replay panel is hidden on load', async ({ page }) => {
    // v-if="open" — panel is not in the DOM when closed
    await expect(page.locator('.replay-panel')).toHaveCount(0)
  })

  test('replay button opens panel', async ({ page }) => {
    await page.locator('[title="Invocation history"]').click()
    await expect(page.locator('.replay-panel')).toBeVisible({ timeout: 10_000 })
  })

  test('close button hides replay panel', async ({ page }) => {
    await page.locator('[title="Invocation history"]').click()
    await expect(page.locator('.replay-panel')).toBeVisible({ timeout: 10_000 })
    await page.locator('.panel-close').click()
    await expect(page.locator('.replay-panel')).toHaveCount(0, { timeout: 5_000 })
  })

  test('empty history shows empty state', async ({ page }) => {
    await page.locator('[title="Invocation history"]').click()
    await expect(page.locator('.replay-panel')).toBeVisible({ timeout: 10_000 })
    // With no records filteredHistory is empty → empty-state renders
    await expect(page.locator('.empty-state')).toBeVisible()
    await expect(page.locator('.empty-state')).toContainText('No invocations recorded yet.')
  })

  test('search input is visible when panel is open', async ({ page }) => {
    await page.locator('[title="Invocation history"]').click()
    await expect(page.locator('.replay-panel')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.search-input')).toBeVisible()
    await expect(page.locator('.search-input')).toHaveAttribute('placeholder', 'search methods…')
  })

  test('clear all button is visible when panel is open', async ({ page }) => {
    await page.locator('[title="Invocation history"]').click()
    await expect(page.locator('.replay-panel')).toBeVisible({ timeout: 10_000 })
    // clear-all-btn is always rendered (disabled when history is empty, but still in DOM)
    await expect(page.locator('.clear-all-btn')).toBeVisible()
    // With empty history the button should be disabled
    await expect(page.locator('.clear-all-btn')).toBeDisabled()
  })

  test('manual save section is present', async ({ page }) => {
    await page.locator('[title="Invocation history"]').click()
    await expect(page.locator('.replay-panel')).toBeVisible({ timeout: 10_000 })
    // The accordion toggle button is always rendered
    await expect(page.locator('.manual-toggle')).toBeVisible()
    await expect(page.locator('.manual-toggle')).toContainText('manual save')
    // The form is hidden until toggle is clicked
    await expect(page.locator('.manual-form')).toHaveCount(0)
    // Click to expand
    await page.locator('.manual-toggle').click()
    await expect(page.locator('.manual-form')).toBeVisible()
    await expect(page.locator('.manual-input')).toBeVisible()
    await expect(page.locator('.manual-save-btn')).toBeVisible()
  })
})
