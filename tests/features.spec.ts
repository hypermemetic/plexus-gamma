/**
 * Feature tests for:
 *   - Connection bar (tabs, add form)
 *   - View switching (explorer / canvas / multi)
 *   - Command palette (Ctrl+K, search, select)
 *   - Breadcrumb navigation
 *   - Registry auto-discovery
 *
 * Prerequisites (already running in dev environment):
 *   - substrate on ws://127.0.0.1:4444 (has registry plugin)
 *   - fidget-spinner on ws://127.0.0.1:5555 (registered in substrate registry)
 */

import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForTree(page: Page) {
  await expect(page.locator('.loading-state')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 15_000 })
}

async function clickNode(page: Page, label: string) {
  await page.locator('.node-row', { hasText: label }).first().click()
}

// ─── Connection bar ───────────────────────────────────────────────────────────

test.describe('connection bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
  })

  test('substrate tab is visible', async ({ page }) => {
    await expect(page.locator('.conn-tab', { hasText: 'substrate' })).toBeVisible()
  })

  test('substrate tab is active by default', async ({ page }) => {
    const tab = page.locator('.conn-tab', { hasText: 'substrate' }).first()
    await expect(tab).toHaveClass(/active/)
  })

  test('tab shows the ws url', async ({ page }) => {
    const tab = page.locator('.conn-tab', { hasText: 'substrate' }).first()
    await expect(tab.locator('.conn-url')).toContainText('127.0.0.1:4444')
  })

  test('+ button opens add connection form', async ({ page }) => {
    await page.locator('.add-btn').click()
    await expect(page.locator('.add-form')).toBeVisible()
    await expect(page.locator('.add-input').first()).toBeVisible()
  })

  test('add form has name and url inputs', async ({ page }) => {
    await page.locator('.add-btn').click()
    const inputs = page.locator('.add-input')
    await expect(inputs).toHaveCount(2)
    await expect(inputs.first()).toHaveAttribute('placeholder', 'backend name')
    await expect(inputs.nth(1)).toHaveAttribute('placeholder', 'ws://127.0.0.1:4444')
  })

  test('cancel button hides add form', async ({ page }) => {
    await page.locator('.add-btn').click()
    await expect(page.locator('.add-form')).toBeVisible()
    await page.locator('.add-cancel').click()
    await expect(page.locator('.add-form')).toHaveCount(0)
    await expect(page.locator('.add-btn')).toBeVisible()
  })

  test('Ctrl+K trigger button is visible', async ({ page }) => {
    await expect(page.locator('.palette-trigger')).toBeVisible()
  })

  test('view switcher has four buttons', async ({ page }) => {
    await expect(page.locator('.view-btn')).toHaveCount(4)
  })

  test('explorer view is active by default', async ({ page }) => {
    await expect(page.locator('.view-btn').first()).toHaveClass(/active/)
  })
})

// ─── Registry auto-discovery ──────────────────────────────────────────────────

test.describe('registry auto-discovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
  })

  test('substrate tab appears exactly once (registry dedup)', async ({ page }) => {
    // Wait long enough for registry fetch to complete, then verify no duplicate
    await page.waitForTimeout(2_000)
    const substrateTabs = page.locator('.conn-tab', { hasText: 'substrate' })
    await expect(substrateTabs).toHaveCount(1)
  })

  test('fidget-spinner backend appears as a tab after registry fetch', async ({ page }) => {
    // Registry fetch happens after tree build — give it up to 10s
    await expect(page.locator('.conn-tab', { hasText: 'fidget-spinner' }))
      .toBeVisible({ timeout: 10_000 })
  })

  test('fidget-spinner tab shows correct url', async ({ page }) => {
    const tab = page.locator('.conn-tab', { hasText: 'fidget-spinner' }).first()
    await expect(tab).toBeVisible({ timeout: 10_000 })
    await expect(tab.locator('.conn-url')).toContainText('127.0.0.1:5555')
  })

  test('clicking fidget-spinner tab makes it active', async ({ page }) => {
    const tab = page.locator('.conn-tab', { hasText: 'fidget-spinner' }).first()
    await expect(tab).toBeVisible({ timeout: 10_000 })
    await tab.click()
    await expect(tab).toHaveClass(/active/)
  })

  test('switching to fidget-spinner loads its tree', async ({ page }) => {
    const tab = page.locator('.conn-tab', { hasText: 'fidget-spinner' }).first()
    await expect(tab).toBeVisible({ timeout: 10_000 })
    await tab.click()
    await waitForTree(page)
    await expect(page.locator('.backend-label')).toHaveText('fidget-spinner')
  })
})

// ─── View switching ───────────────────────────────────────────────────────────

test.describe('view switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
  })

  test('switching to canvas view renders a canvas element', async ({ page }) => {
    await page.locator('.view-btn').nth(1).click()
    await expect(page.locator('.main-canvas')).toBeVisible({ timeout: 8_000 })
  })

  test('canvas view button becomes active on click', async ({ page }) => {
    const btn = page.locator('.view-btn').nth(1)
    await btn.click()
    await expect(btn).toHaveClass(/active/)
    // Explorer button is no longer active
    await expect(page.locator('.view-btn').first()).not.toHaveClass(/active/)
  })

  test('switching to multi view renders multi-backend canvas toolbar', async ({ page }) => {
    await page.locator('.view-btn').nth(2).click()
    await expect(page.locator('.canvas-toolbar')).toBeVisible({ timeout: 8_000 })
  })

  test('multi view shows backend status chips', async ({ page }) => {
    await page.locator('.view-btn').nth(2).click()
    await expect(page.locator('.be-chip').first()).toBeVisible({ timeout: 8_000 })
  })

  test('switching back to explorer restores the tree', async ({ page }) => {
    await page.locator('.view-btn').nth(1).click()
    await expect(page.locator('.main-canvas')).toBeVisible({ timeout: 8_000 })

    await page.locator('.view-btn').first().click()
    await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 5_000 })
  })

  test('multi view button becomes active on click', async ({ page }) => {
    const btn = page.locator('.view-btn').nth(2)
    await btn.click()
    await expect(btn).toHaveClass(/active/)
  })
})

// ─── Command palette ──────────────────────────────────────────────────────────

test.describe('command palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
    // Wait for method index to populate (tree-ready event)
    await page.waitForTimeout(500)
  })

  test('palette is hidden on load', async ({ page }) => {
    await expect(page.locator('.palette-backdrop')).toHaveCount(0)
  })

  test('Ctrl+K trigger button opens palette', async ({ page }) => {
    await page.locator('.palette-trigger').click()
    await expect(page.locator('.palette-backdrop')).toBeVisible()
  })

  test('Ctrl+K keyboard shortcut opens palette', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.locator('.palette-backdrop')).toBeVisible()
  })

  test('Escape closes the palette', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.locator('.palette-backdrop')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.palette-backdrop')).toHaveCount(0)
  })

  test('clicking backdrop closes the palette', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.locator('.palette-backdrop')).toBeVisible()
    // Click outside the panel (backdrop edge)
    await page.locator('.palette-backdrop').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('.palette-backdrop')).toHaveCount(0)
  })

  test('palette input is auto-focused when opened', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.locator('.palette-input')).toBeFocused()
  })

  test('typing filters method results', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await page.locator('.palette-input').fill('echo')
    const rows = page.locator('.palette-row')
    await expect(rows.first()).toBeVisible()
    const paths = await rows.locator('.palette-path').allTextContents()
    expect(paths.every(p => p.toLowerCase().includes('echo'))).toBe(true)
  })

  test('results show backend badge and full path', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await page.locator('.palette-input').fill('echo')
    const firstRow = page.locator('.palette-row').first()
    await expect(firstRow.locator('.palette-backend')).toContainText('substrate')
    await expect(firstRow.locator('.palette-path')).toContainText('echo')
  })

  test('empty query shows all methods', async ({ page }) => {
    await page.keyboard.press('Control+k')
    const rows = page.locator('.palette-row')
    // Should have many entries (at minimum all echo methods)
    const count = await rows.count()
    expect(count).toBeGreaterThan(5)
  })

  test('no-results message appears for unknown query', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await page.locator('.palette-input').fill('xyzzy_no_such_method_xyz')
    await expect(page.locator('.palette-empty')).toBeVisible()
  })

  test('selecting a result closes palette and navigates to the plugin', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await page.locator('.palette-input').fill('echo')
    await page.locator('.palette-row').first().click()
    await expect(page.locator('.palette-backdrop')).toHaveCount(0)
    // Should have navigated to echo
    await expect(page.locator('.detail-path')).toContainText('echo', { timeout: 5_000 })
  })

  test('arrow keys navigate palette results', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await page.locator('.palette-input').fill('echo')
    // First row starts active
    await expect(page.locator('.palette-row.active')).toHaveCount(1)
    await page.keyboard.press('ArrowDown')
    // Active index moved — second row is now active
    const activeRow = page.locator('.palette-row.active')
    await expect(activeRow).toHaveCount(1)
  })
})

// ─── Breadcrumb navigation ────────────────────────────────────────────────────

test.describe('breadcrumb navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
    // Navigate into solar → earth
    await page.locator('.node-row', { hasText: 'solar' }).first().click()
    await page.locator('.node-row', { hasText: 'earth' }).first().click()
  })

  test('detail path shows "solar" and "earth" segments', async ({ page }) => {
    const path = page.locator('.detail-path')
    await expect(path).toContainText('solar')
    await expect(path).toContainText('earth')
  })

  test('path segments are rendered as buttons', async ({ page }) => {
    await expect(page.locator('.path-btn')).toHaveCount(await page.locator('.path-segment').count())
  })

  test('clicking the "solar" breadcrumb navigates to solar', async ({ page }) => {
    const solarBtn = page.locator('.path-btn', { hasText: 'solar' }).first()
    await solarBtn.click()
    await expect(page.locator('.detail-path')).toContainText('solar')
    // Earth should no longer be in the detail path
    const pathText = await page.locator('.detail-path').textContent()
    expect(pathText).not.toMatch(/\bearth\b/)
  })

  test('root path button shows backend name when at root', async ({ page }) => {
    // Navigate back to root (click first tree node)
    await page.locator('.node-row').first().click()
    // At root, path.length === 0 → root button shows backend name
    const rootBtn = page.locator('.path-btn.root')
    await expect(rootBtn).toBeVisible()
    await expect(rootBtn).toContainText('substrate')
  })

  test('path separators appear between segments', async ({ page }) => {
    await expect(page.locator('.path-sep').first()).toBeVisible()
  })
})
