/**
 * Screenshot capture tests — saves to docs/screenshots/ for README embedding.
 *
 * Each test:
 *   1. Forces daylight theme so screenshots look clean on GitHub README
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

/** Force daylight theme regardless of stored localStorage. */
async function setDaylightTheme(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('plexus-theme', 'daylight')
    document.documentElement.dataset.theme = 'daylight'
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.setAttribute('data-theme', 'daylight')
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
  await setDaylightTheme(page)
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
  await setDaylightTheme(page)
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

  // Switch to dots mode so nodes are compact, then fit to show all structure
  await page.locator('.tool-btn[title="Method dots"]').click()
  await page.locator('.tool-btn[title="Fit to view"]').click()
  await page.evaluate(() => new Promise(r => requestAnimationFrame(r)))

  const p = await capture(page, '02-topology')
  assertCaptured(p)
})

test('03 — sheet: bottom panel open', async ({ page }) => {
  await page.goto('/')
  await setDaylightTheme(page)
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

test('04 — wiring: bash → mustache template → bash', async ({ page }) => {
  // Start clean
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('plexus-wiring-v1')
    localStorage.setItem('plexus-theme', 'daylight')
    document.documentElement.setAttribute('data-theme', 'daylight')
  })
  await page.reload()

  await waitForTree(page)
  await page.locator('.view-tab').nth(TAB.wiring).click()
  await expect(page.locator('.wiring-root')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('.sidebar-search')).toBeVisible({ timeout: 8_000 })

  // Add first bash.execute node (n1)
  await page.locator('.sidebar-search').fill('bash')
  await expect(page.locator('.sb-row-method').first()).toBeVisible({ timeout: 10_000 })
  await page.locator('.sb-row-method').nth(0).click()
  await expect(page.locator('.wire-node').first()).toBeVisible({ timeout: 8_000 })

  // Clear search so transform buttons are visible, then add Template (mustache) node (n2)
  await page.locator('.sidebar-search').fill('')
  await expect(page.locator('.transform-btn', { hasText: 'Template' })).toBeVisible({ timeout: 5_000 })
  await page.locator('.transform-btn', { hasText: 'Template' }).click()
  await expect(page.locator('.wire-node').nth(1)).toBeVisible({ timeout: 8_000 })

  // Search bash again and add second bash.execute node (n3)
  await page.locator('.sidebar-search').fill('bash')
  await expect(page.locator('.sb-row-method').first()).toBeVisible({ timeout: 10_000 })
  await page.locator('.sb-row-method').nth(0).click()
  await expect(page.locator('.wire-node').nth(2)).toBeVisible({ timeout: 8_000 })

  // Wait for the wiring state to be persisted to localStorage
  await page.waitForFunction(() => {
    try {
      const raw = localStorage.getItem('plexus-wiring-v1')
      return raw !== null && JSON.parse(raw).nodes?.length >= 3
    } catch { return false }
  }, { timeout: 5_000 })

  // Inject edges, params, and mustache template directly into the wiring state.
  // Pipeline: bash "printf hello" → template(mustache) → bash runs rendered cmd
  await page.evaluate(() => {
    const raw = localStorage.getItem('plexus-wiring-v1')!
    const state = JSON.parse(raw)
    const [n1, n2, n3] = state.nodes

    // Detect the bash param name from the live schema (usually 'command')
    const bashProps = n1?.method?.method?.params?.properties ?? {}
    const bashParam = Object.keys(bashProps)[0] ?? 'command'

    // n1: run a simple command (printf = no trailing newline)
    n1.params = { [bashParam]: "printf 'hello plexus'" }

    // n2: mustache template — accesses slot0.line (first stdout line from n1)
    // {{slot0.line}} resolves because we use routing:'first' on n1→n2
    n2.transform.template = 'echo "{{slot0.line}}" | tr a-z A-Z'
    n2.transform.inputNames = ['slot0']

    // n3: command driven entirely by wired input from n2
    n3.params = {}

    // Space nodes far apart so the bezier curves are visible
    n1.pos = { x: 60,  y: 100 }
    n2.pos = { x: 380, y: 100 }
    n3.pos = { x: 700, y: 100 }

    // Wire n1 → n2(slot0): routing 'first' extracts the first stream item
    // ({"line":"hello plexus","type":"stdout"}) so {{slot0.line}} resolves
    // Wire n2 → n3(command): routing 'auto' passes the rendered string directly
    state.edges = [
      {
        id: 'e1', fromNodeId: n1.id, toNodeId: n2.id, toParam: 'slot0',
        routing: 'first',
        routeConfig: { separator: '\n', predicate: '', reducer: '', initial: '', typeFilter: [] },
      },
      {
        id: 'e2', fromNodeId: n2.id, toNodeId: n3.id, toParam: bashParam,
        routing: 'auto',
        routeConfig: { separator: '\n', predicate: '', reducer: '', initial: '', typeFilter: [] },
      },
    ]

    localStorage.setItem('plexus-wiring-v1', JSON.stringify(state))
    // Return to explorer so waitForTree works after reload
    localStorage.setItem('plexus-active-view', 'multi-explorer')
  })

  // Reload so the wiring canvas picks up the full pre-wired state
  await page.reload()
  await waitForTree(page)  // confirms backend is connected
  await page.locator('.view-tab').nth(TAB.wiring).click()
  await expect(page.locator('.wire-node').nth(2)).toBeVisible({ timeout: 8_000 })

  // Deselect any nodes, then run the pipeline
  await page.keyboard.press('Escape')
  await page.locator('.tb-run').click()

  // Wait for all 3 nodes to complete (last node result appears last)
  await expect(page.locator('.node-result').nth(2)).toBeVisible({ timeout: 20_000 })

  // Log the execution results for debugging
  const nodeResults = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.wire-node')).map(node => ({
      id: (node as HTMLElement).dataset.id,
      status: [...node.classList].find(c => c.startsWith('status-'))?.replace('status-', ''),
      result: node.querySelector('.result-value')?.textContent?.trim(),
    }))
  )
  console.log('Wiring execution results:', JSON.stringify(nodeResults, null, 2))

  // Hide minimap overlay before capture
  await page.addStyleTag({ content: '.wiring-minimap { display: none !important; }' })

  const p = await capture(page, '04-wiring')
  assertCaptured(p)
})
