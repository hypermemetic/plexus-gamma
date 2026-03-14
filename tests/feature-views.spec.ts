/**
 * Feature tests for:
 *   - Method Wiring Canvas (view tab "wiring", index 4)
 *   - Orchestration Canvas  (view tab "orchestrate", index 5)
 *
 * Tab layout: [0]=all  [1]=explorer  [2]=canvas  [3]=sheet  [4]=wiring  [5]=orchestrate
 *
 * Prerequisites (already running in dev environment):
 *   - substrate on ws://127.0.0.1:4444 (has registry plugin)
 *   - fidget-spinner on ws://127.0.0.1:5555 (registered in substrate registry)
 */

import { test, expect, type Page } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForTree(page: Page) {
  await expect(page.locator('.loading-state')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 15_000 })
}

const WIRING_BTN_IDX        = 4
const ORCHESTRATION_BTN_IDX = 5

// ─── Method Wiring Canvas ─────────────────────────────────────────────────────

test.describe('method wiring canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
  })

  test('wiring view tab is visible', async ({ page }) => {
    const btn = page.locator('.view-tab').nth(WIRING_BTN_IDX)
    await expect(btn).toBeVisible()
    await expect(btn).toContainText('wiring')
  })

  test('clicking wiring view tab makes it active', async ({ page }) => {
    const btn = page.locator('.view-tab').nth(WIRING_BTN_IDX)
    await btn.click()
    await expect(btn).toHaveClass(/active/)
    // All tab is no longer active
    await expect(page.locator('.view-tab').first()).not.toHaveClass(/active/)
  })

  test('wiring view renders the canvas container', async ({ page }) => {
    await page.locator('.view-tab').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.wiring-root')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.canvas-wrap')).toBeVisible({ timeout: 10_000 })
  })

  test('wiring view shows the method sidebar', async ({ page }) => {
    await page.locator('.view-tab').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 })
  })

  test('wiring view sidebar has a search input', async ({ page }) => {
    await page.locator('.view-tab').nth(WIRING_BTN_IDX).click()
    const searchInput = page.locator('.sidebar-search')
    await expect(searchInput).toBeVisible({ timeout: 10_000 })
    await expect(searchInput).toHaveAttribute('placeholder', 'Search methods…')
  })

  test('wiring view shows methods from the connected backend via search', async ({ page }) => {
    await page.locator('.view-tab').nth(WIRING_BTN_IDX).click()
    // Search to enter search mode and reveal method items
    await page.locator('.sidebar-search').fill('echo')
    await expect(page.locator('.sidebar-item').first()).toBeVisible({ timeout: 10_000 })
  })

  test('clicking a method in sidebar adds a node to the canvas', async ({ page }) => {
    await page.locator('.view-tab').nth(WIRING_BTN_IDX).click()
    // Use search mode to show methods
    await page.locator('.sidebar-search').fill('echo')
    await expect(page.locator('.sidebar-item').first()).toBeVisible({ timeout: 10_000 })
    // Canvas should be empty initially
    await expect(page.locator('.canvas-empty')).toBeVisible()
    // Click the first sidebar entry
    await page.locator('.sidebar-item').first().click()
    // A wire-node should now exist in the canvas
    await expect(page.locator('.wire-node').first()).toBeVisible({ timeout: 10_000 })
    // Empty state should be gone
    await expect(page.locator('.canvas-empty')).toHaveCount(0)
  })

  test('canvas toolbar has a Run button', async ({ page }) => {
    await page.locator('.view-tab').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.toolbar')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.tb-run')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.tb-run')).toContainText('Run')
  })

  test('canvas toolbar has a Clear button', async ({ page }) => {
    await page.locator('.view-tab').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.toolbar')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.tb-btn', { hasText: 'Clear' })).toBeVisible({ timeout: 10_000 })
  })

  test('canvas toolbar has an Export JSON button', async ({ page }) => {
    await page.locator('.view-tab').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.toolbar')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.tb-btn', { hasText: 'Export JSON' })).toBeVisible({ timeout: 10_000 })
  })

  test('switching away from wiring view hides it', async ({ page }) => {
    await page.locator('.view-tab').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.wiring-root')).toBeVisible({ timeout: 10_000 })
    // Switch back to all view
    await page.locator('.view-tab').first().click()
    await expect(page.locator('.wiring-root')).toHaveCount(0)
    // Tree should be back
    await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 10_000 })
  })
})

// ─── Orchestration Canvas ─────────────────────────────────────────────────────

test.describe('orchestration canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
    // Clear any persisted workflows so tests start from a clean state
    await page.evaluate(() => localStorage.removeItem('plexus-gamma:workflows'))
  })

  test('orchestration view tab is visible', async ({ page }) => {
    const btn = page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX)
    await expect(btn).toBeVisible()
    await expect(btn).toContainText('orchestrate')
  })

  test('clicking orchestration view tab makes it active', async ({ page }) => {
    const btn = page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX)
    await btn.click()
    await expect(btn).toHaveClass(/active/)
    // All tab is no longer active
    await expect(page.locator('.view-tab').first()).not.toHaveClass(/active/)
  })

  test('orchestration view renders the layout', async ({ page }) => {
    await page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX).click()
    await expect(page.locator('.orch-root')).toBeVisible({ timeout: 10_000 })
  })

  test('orchestration view shows the workflow list panel', async ({ page }) => {
    await page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX).click()
    await expect(page.locator('.orch-sidebar')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.workflow-list')).toBeVisible({ timeout: 10_000 })
  })

  test('new workflow button is visible', async ({ page }) => {
    await page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX).click()
    await expect(page.locator('.btn-new')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.btn-new')).toContainText('New')
  })

  test('clicking new workflow creates an untitled workflow', async ({ page }) => {
    await page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX).click()
    await page.locator('.btn-new').click()
    await expect(page.locator('.orch-topbar')).toBeVisible({ timeout: 10_000 })
    const nameInput = page.locator('.wf-name-input')
    await expect(nameInput).toBeVisible({ timeout: 10_000 })
  })

  test('created workflow appears in the list', async ({ page }) => {
    await page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX).click()
    await page.locator('.btn-new').click()
    await expect(page.locator('.workflow-item').first()).toBeVisible({ timeout: 10_000 })
  })

  test('workflow editor shows Add step button', async ({ page }) => {
    await page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX).click()
    await page.locator('.btn-new').click()
    await expect(page.locator('.orch-topbar')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.btn-action', { hasText: '+ Add step' })).toBeVisible({ timeout: 10_000 })
  })

  test('clicking add step shows a method search dropdown', async ({ page }) => {
    await page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX).click()
    await page.locator('.btn-new').click()
    await expect(page.locator('.btn-action', { hasText: '+ Add step' })).toBeVisible({ timeout: 10_000 })
    await page.locator('.btn-action', { hasText: '+ Add step' }).click()
    await expect(page.locator('.step-dropdown-wrap')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.step-search-input')).toBeVisible({ timeout: 10_000 })
  })

  test('workflow name is editable', async ({ page }) => {
    await page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX).click()
    await page.locator('.btn-new').click()
    const nameInput = page.locator('.wf-name-input')
    await expect(nameInput).toBeVisible({ timeout: 10_000 })
    await nameInput.fill('My Test Workflow')
    await expect(nameInput).toHaveValue('My Test Workflow')
    await expect(page.locator('.workflow-item .workflow-name')).toContainText('My Test Workflow')
  })

  test('switching away from orchestration view hides it', async ({ page }) => {
    await page.locator('.view-tab').nth(ORCHESTRATION_BTN_IDX).click()
    await expect(page.locator('.orch-root')).toBeVisible({ timeout: 10_000 })
    // Switch back to all view
    await page.locator('.view-tab').first().click()
    await expect(page.locator('.orch-root')).toHaveCount(0)
    // Tree should be back
    await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 10_000 })
  })
})
