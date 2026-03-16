/**
 * Screenshot capture tests — saves to docs/screenshots/ for README embedding.
 *
 * Each test:
 *   1. Forces midnight theme so screenshots are consistent
 *   2. Waits for the exact UI state needed (no arbitrary timeouts)
 *   3. Injects transparent-background CSS so PNGs blend into README
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

/** Force midnight theme regardless of stored localStorage. */
async function setMidnightTheme(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('plexus-theme', 'midnight')
    document.documentElement.dataset.theme = 'midnight'
  })
}

/** Inject transparent-background CSS, then capture a transparent PNG. */
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
  await setMidnightTheme(page)
  await page.reload()

  await waitForTree(page)
  await page.locator('.node-row', { hasText: 'echo' }).first().click()

  // Wait until the echo plugin's method cards have rendered
  await expect(page.locator('.method-card').first()).toBeVisible({ timeout: 10_000 })

  const p = await capture(page, '01-explorer')
  assertCaptured(p)
})

test('02 — topology: canvas graph', async ({ page }) => {
  await page.goto('/')
  await setMidnightTheme(page)
  await page.reload()

  await waitForTree(page)
  await page.locator('.view-tab').nth(TAB.topology).click()
  await expect(page.locator('.main-canvas')).toBeVisible({ timeout: 8_000 })

  // Wait until both backends have drawn their node cards onto the canvas.
  // We poll pixel data: node cards produce non-background-coloured pixels.
  // We require content in both the left half (substrate) and right half (fidget-spinner)
  // so we know the full layout is ready before capturing.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.main-canvas') as HTMLCanvasElement | null
    if (!canvas) return false
    const ctx = canvas.getContext('2d')
    if (!ctx || canvas.width < 200) return false
    const w = canvas.width, h = canvas.height
    const left  = ctx.getImageData(0,       0, w / 2, h).data
    const right = ctx.getImageData(w / 2,   0, w / 2, h).data
    const lit = (d: Uint8ClampedArray) => {
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) n++
      return n
    }
    // Both halves must have node content
    return lit(left) > 100 && lit(right) > 50
  }, { timeout: 15_000 })

  const p = await capture(page, '02-topology')
  assertCaptured(p)
})

test('03 — sheet: bottom panel open', async ({ page }) => {
  await page.goto('/')
  await setMidnightTheme(page)
  await page.reload()

  await waitForTree(page)
  await page.locator('.view-tab').nth(TAB.sheet).click()

  // Wait for trees in sheet view to load
  await expect(page.locator('.tree .node-row').first()).toBeVisible({ timeout: 15_000 })

  // Click a leaf node to open the bottom sheet
  await page.locator('.tree .node-row.leaf').first().click()

  // Wait until the bottom sheet has loaded schema content (methods section)
  await expect(page.locator('.sheet-section').first()).toBeVisible({ timeout: 10_000 })

  const p = await capture(page, '03-sheet')
  assertCaptured(p)
})

test('04 — wiring: bash nodes', async ({ page }) => {
  // Clear any previous wiring state so canvas starts fresh
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('plexus-wiring-v1')
    localStorage.setItem('plexus-theme', 'midnight')
    document.documentElement.dataset.theme = 'midnight'
  })
  await page.reload()

  await waitForTree(page)
  await page.locator('.view-tab').nth(TAB.wiring).click()
  await expect(page.locator('.wiring-root')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('.sidebar-search')).toBeVisible({ timeout: 8_000 })

  // Search for bash methods and add two nodes to the canvas
  await page.locator('.sidebar-search').fill('bash')
  await expect(page.locator('.sb-row-method').first()).toBeVisible({ timeout: 10_000 })

  // Add first bash node — wait for it to appear on canvas
  await page.locator('.sb-row-method').nth(0).click()
  await expect(page.locator('.wire-node').first()).toBeVisible({ timeout: 8_000 })

  // Add second bash node — wait for it to appear
  await page.locator('.sb-row-method').nth(0).click()
  await expect(page.locator('.wire-node').nth(1)).toBeVisible({ timeout: 8_000 })

  // Deselect any nodes so no detail panel is open
  await page.keyboard.press('Escape')
  await expect(page.locator('.wire-node-detail')).toBeHidden({ timeout: 3_000 })

  // Hide the minimap overlay before capture
  await page.addStyleTag({ content: '.wiring-minimap { display: none !important; }' })

  const p = await capture(page, '04-wiring')
  assertCaptured(p)
})
