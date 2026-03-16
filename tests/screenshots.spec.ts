/**
 * Screenshot capture tests — saves to docs/screenshots/ for README embedding.
 *
 * Each test:
 *   1. Navigates to a view and waits for it to fully load
 *   2. Injects a style that makes outer container backgrounds transparent
 *   3. Takes a screenshot with omitBackground:true (transparent PNG)
 *   4. Asserts the file was written and is non-empty
 *
 * Run independently:
 *   bun run screenshots
 */
import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'url'
import * as path from 'path'
import * as fs from 'fs'

const SHOTS_DIR = path.join(fileURLToPath(import.meta.url), '../../docs/screenshots')

// Tab indices in .view-tabs
const TAB = { explore: 0, topology: 1, sheet: 2, wiring: 3, orchestrate: 4 }

test.beforeAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function shotPath(name: string) {
  return path.join(SHOTS_DIR, `${name}.png`)
}

/** Inject transparent-background override, then capture a transparent PNG. */
async function capture(page: Page, name: string): Promise<string> {
  await page.addStyleTag({
    content: 'html, body, #app, .app { background: transparent !important; }',
  })
  const p = shotPath(name)
  await page.screenshot({ path: p, omitBackground: true })
  return p
}

/** Assert a screenshot file was actually written and contains image data. */
function assertCaptured(filePath: string) {
  expect(fs.existsSync(filePath), `screenshot file missing: ${filePath}`).toBe(true)
  expect(
    fs.statSync(filePath).size,
    `screenshot file is empty: ${filePath}`,
  ).toBeGreaterThan(1024) // a valid PNG is at least 1 KB
}

async function waitForTree(page: Page) {
  await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 15_000 })
}

// ── Screenshots ───────────────────────────────────────────────────────────────

test('01 — explorer: echo plugin selected', async ({ page }) => {
  await page.goto('/')
  await waitForTree(page)

  // Select echo plugin so the detail pane has rich content
  await page.locator('.node-row', { hasText: 'echo' }).first().click()
  await page.waitForTimeout(500)

  const p = await capture(page, '01-explorer')
  assertCaptured(p)
})

test('02 — topology: canvas graph', async ({ page }) => {
  await page.goto('/')
  await waitForTree(page)

  await page.locator('.view-tab').nth(TAB.topology).click()
  await expect(page.locator('.main-canvas')).toBeVisible({ timeout: 8_000 })
  await page.waitForTimeout(2_500) // wait for tree layout + render

  const p = await capture(page, '02-topology')
  assertCaptured(p)
})

test('03 — sheet: bottom panel open', async ({ page }) => {
  await page.goto('/')
  await waitForTree(page)

  await page.locator('.view-tab').nth(TAB.sheet).click()
  // Wait for at least one backend tree to load
  await expect(page.locator('.tree .node-row').first()).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(400)

  // Click a leaf node to open the bottom sheet
  await page.locator('.tree .node-row.leaf').first().click()
  await page.waitForTimeout(500)

  const p = await capture(page, '03-sheet')
  assertCaptured(p)
})

test('04 — wiring: method wiring canvas', async ({ page }) => {
  await page.goto('/')
  await waitForTree(page)

  await page.locator('.view-tab').nth(TAB.wiring).click()
  await expect(page.locator('.wiring-root')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 8_000 })
  await page.waitForTimeout(400)

  const p = await capture(page, '04-wiring')
  assertCaptured(p)
})
