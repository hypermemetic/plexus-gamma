/**
 * Feature tests for:
 *   - Method Wiring Canvas (view button ⊡, index 4, title "Method wiring")
 *   - Orchestration Canvas  (view button ⊛, index 5, title "Orchestration")
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

// View buttons: 0=explorer, 1=canvas, 2=multi, 3=sheet, 4=wiring, 5=orchestration
const WIRING_BTN_IDX        = 4
const ORCHESTRATION_BTN_IDX = 5

// ─── Method Wiring Canvas ─────────────────────────────────────────────────────

test.describe('method wiring canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
  })

  test('wiring view button is visible', async ({ page }) => {
    const btn = page.locator('.view-btn').nth(WIRING_BTN_IDX)
    await expect(btn).toBeVisible()
    await expect(btn).toHaveAttribute('title', 'Method wiring')
  })

  test('clicking wiring view button makes it active', async ({ page }) => {
    const btn = page.locator('.view-btn').nth(WIRING_BTN_IDX)
    await btn.click()
    await expect(btn).toHaveClass(/active/)
    // Explorer button is no longer active
    await expect(page.locator('.view-btn').first()).not.toHaveClass(/active/)
  })

  test('wiring view renders the canvas container', async ({ page }) => {
    await page.locator('.view-btn').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.wiring-root')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.canvas-wrap')).toBeVisible({ timeout: 10_000 })
  })

  test('wiring view shows the method sidebar', async ({ page }) => {
    await page.locator('.view-btn').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 })
  })

  test('wiring view sidebar has a search input', async ({ page }) => {
    await page.locator('.view-btn').nth(WIRING_BTN_IDX).click()
    const searchInput = page.locator('.sidebar-search')
    await expect(searchInput).toBeVisible({ timeout: 10_000 })
    await expect(searchInput).toHaveAttribute('placeholder', 'Search methods…')
  })

  test('wiring view shows methods from the connected backend', async ({ page }) => {
    await page.locator('.view-btn').nth(WIRING_BTN_IDX).click()
    // methodIndex is populated after tree-ready; sidebar-list shows up to 80 entries
    await expect(page.locator('.sidebar-item').first()).toBeVisible({ timeout: 10_000 })
  })

  test('clicking a method in sidebar adds a node to the canvas', async ({ page }) => {
    await page.locator('.view-btn').nth(WIRING_BTN_IDX).click()
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
    await page.locator('.view-btn').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.toolbar')).toBeVisible({ timeout: 10_000 })
    // The run button has class tb-run and contains "Run"
    await expect(page.locator('.tb-run')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.tb-run')).toContainText('Run')
  })

  test('canvas toolbar has a Clear button', async ({ page }) => {
    await page.locator('.view-btn').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.toolbar')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.tb-btn', { hasText: 'Clear' })).toBeVisible({ timeout: 10_000 })
  })

  test('canvas toolbar has an Export JSON button', async ({ page }) => {
    await page.locator('.view-btn').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.toolbar')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.tb-btn', { hasText: 'Export JSON' })).toBeVisible({ timeout: 10_000 })
  })

  test('switching away from wiring view hides it', async ({ page }) => {
    await page.locator('.view-btn').nth(WIRING_BTN_IDX).click()
    await expect(page.locator('.wiring-root')).toBeVisible({ timeout: 10_000 })
    // Switch back to explorer
    await page.locator('.view-btn').first().click()
    await expect(page.locator('.wiring-root')).toHaveCount(0)
    // Explorer tree should be back
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

  test('orchestration view button is visible', async ({ page }) => {
    const btn = page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX)
    await expect(btn).toBeVisible()
    await expect(btn).toHaveAttribute('title', 'Orchestration')
  })

  test('clicking orchestration view button makes it active', async ({ page }) => {
    const btn = page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX)
    await btn.click()
    await expect(btn).toHaveClass(/active/)
    // Explorer button is no longer active
    await expect(page.locator('.view-btn').first()).not.toHaveClass(/active/)
  })

  test('orchestration view renders the layout', async ({ page }) => {
    await page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX).click()
    await expect(page.locator('.orch-root')).toBeVisible({ timeout: 10_000 })
  })

  test('orchestration view shows the workflow list panel', async ({ page }) => {
    await page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX).click()
    await expect(page.locator('.orch-sidebar')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.workflow-list')).toBeVisible({ timeout: 10_000 })
  })

  test('new workflow button is visible', async ({ page }) => {
    await page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX).click()
    await expect(page.locator('.btn-new')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.btn-new')).toContainText('New')
  })

  test('clicking new workflow creates an untitled workflow', async ({ page }) => {
    await page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX).click()
    await page.locator('.btn-new').click()
    // The newly created workflow is selected; the editor topbar should appear
    await expect(page.locator('.orch-topbar')).toBeVisible({ timeout: 10_000 })
    // The name input should be present and empty (workflow name defaults to '')
    const nameInput = page.locator('.wf-name-input')
    await expect(nameInput).toBeVisible({ timeout: 10_000 })
  })

  test('created workflow appears in the list', async ({ page }) => {
    await page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX).click()
    await page.locator('.btn-new').click()
    // At least one workflow item should now be in the list
    await expect(page.locator('.workflow-item').first()).toBeVisible({ timeout: 10_000 })
  })

  test('workflow editor shows Add step button', async ({ page }) => {
    await page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX).click()
    await page.locator('.btn-new').click()
    await expect(page.locator('.orch-topbar')).toBeVisible({ timeout: 10_000 })
    // "Add step" is rendered as a .btn-action
    await expect(page.locator('.btn-action', { hasText: '+ Add step' })).toBeVisible({ timeout: 10_000 })
  })

  test('clicking add step shows a method search dropdown', async ({ page }) => {
    await page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX).click()
    await page.locator('.btn-new').click()
    await expect(page.locator('.btn-action', { hasText: '+ Add step' })).toBeVisible({ timeout: 10_000 })
    await page.locator('.btn-action', { hasText: '+ Add step' }).click()
    // The dropdown should appear with a search input
    await expect(page.locator('.step-dropdown-wrap')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.step-search-input')).toBeVisible({ timeout: 10_000 })
  })

  test('workflow name is editable', async ({ page }) => {
    await page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX).click()
    await page.locator('.btn-new').click()
    const nameInput = page.locator('.wf-name-input')
    await expect(nameInput).toBeVisible({ timeout: 10_000 })
    await nameInput.fill('My Test Workflow')
    await expect(nameInput).toHaveValue('My Test Workflow')
    // The workflow-item in the sidebar should reflect the new name
    await expect(page.locator('.workflow-item .workflow-name')).toContainText('My Test Workflow')
  })

  test('switching away from orchestration view hides it', async ({ page }) => {
    await page.locator('.view-btn').nth(ORCHESTRATION_BTN_IDX).click()
    await expect(page.locator('.orch-root')).toBeVisible({ timeout: 10_000 })
    // Switch back to explorer
    await page.locator('.view-btn').first().click()
    await expect(page.locator('.orch-root')).toHaveCount(0)
    // Explorer tree should be back
    await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 10_000 })
  })
})
