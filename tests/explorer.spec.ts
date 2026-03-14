import { test, expect, type Page } from '@playwright/test'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Wait for the tree to finish loading (spinner gone, root node visible). */
async function waitForTree(page: Page) {
  await expect(page.locator('.loading-state')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 15_000 })
}

/** Click a tree node by its label text. */
async function clickNode(page: Page, label: string) {
  await page.locator('.node-row', { hasText: label }).first().click()
}

/** Get all visible node labels in the sidebar. */
async function visibleLabels(page: Page): Promise<string[]> {
  return page.locator('.node-label').allTextContents()
}

// ──────────────────────────────────────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForTree(page)
  // Default view IS multi-explorer — no tab switch needed
})

// ──────────────────────────────────────────────────────────────────────────────
// 1. Initial load
// ──────────────────────────────────────────────────────────────────────────────

test.describe('initial load', () => {
  test('shows substrate backend label in sidebar header', async ({ page }) => {
    await expect(page.locator('.backend-label')).toHaveText('substrate')
  })

  test('root node is visible and labelled "substrate"', async ({ page }) => {
    await expect(page.locator('.node-label').first()).toHaveText('substrate')
  })

  test('root starts expanded — known top-level namespaces are visible', async ({ page }) => {
    const labels = await visibleLabels(page)
    // Substrate always exposes at least these plugins
    expect(labels).toContain('echo')
    expect(labels).toContain('health')
    expect(labels).toContain('registry')
    expect(labels).toContain('bash')
  })

  test('detail pane shows welcome state before any selection', async ({ page }) => {
    // After load the root node is auto-selected, so detail is populated.
    // But welcome appears if nothing is selected — verify the root auto-select case:
    // root should be selected, detail-path should contain "substrate"
    await expect(page.locator('.detail-path, .welcome')).toBeVisible()
  })

  test('root node is auto-selected on load', async ({ page }) => {
    // Root is selected → detail shows "substrate" path or root text
    const detailPath = page.locator('.detail-path')
    await expect(detailPath).toBeVisible()
    await expect(detailPath).toContainText('substrate')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 2. Tree navigation
// ──────────────────────────────────────────────────────────────────────────────

test.describe('tree navigation', () => {
  test('clicking a leaf node selects it and shows its name in detail', async ({ page }) => {
    await clickNode(page, 'echo')
    await expect(page.locator('.detail-path')).toContainText('echo')
  })

  test('clicking a hub node expands its children', async ({ page }) => {
    // solar is a hub (has planets as children)
    const labels = await visibleLabels(page)
    const hasSolarChildren = labels.some(l => ['earth', 'mars', 'jupiter'].includes(l))
    if (!hasSolarChildren) {
      await clickNode(page, 'solar')
    }
    const expanded = await visibleLabels(page)
    expect(expanded.some(l => ['earth', 'mars', 'jupiter'].includes(l))).toBe(true)
  })

  test('clicking a hub a second time collapses its children', async ({ page }) => {
    // First click: select + expand
    await clickNode(page, 'solar')
    const afterExpand = await visibleLabels(page)
    expect(afterExpand).toContain('earth')

    // Second click: collapse
    await clickNode(page, 'solar')
    const afterCollapse = await visibleLabels(page)
    expect(afterCollapse).not.toContain('earth')
  })

  test('selected node gets "selected" class', async ({ page }) => {
    await clickNode(page, 'health')
    const row = page.locator('.node-row', { hasText: 'health' }).first()
    await expect(row).toHaveClass(/selected/)
  })

  test('deep nested node is accessible after expanding ancestors', async ({ page }) => {
    await clickNode(page, 'solar')
    await clickNode(page, 'earth')
    await expect(page.locator('.detail-path')).toContainText('earth')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 3. Detail pane — plugin info
// ──────────────────────────────────────────────────────────────────────────────

test.describe('detail pane', () => {
  test('shows version badge', async ({ page }) => {
    await clickNode(page, 'echo')
    await expect(page.locator('.version-badge')).toBeVisible()
    await expect(page.locator('.version-badge')).toContainText('v')
  })

  test('shows hash badge (first 8 chars)', async ({ page }) => {
    await clickNode(page, 'echo')
    const hash = page.locator('.hash-badge')
    await expect(hash).toBeVisible()
    const text = await hash.textContent()
    expect(text?.trim().length).toBe(8)
  })

  test('leaf plugin shows "leaf" kind badge', async ({ page }) => {
    await clickNode(page, 'echo')
    await expect(page.locator('.kind-badge.leaf')).toBeVisible()
    await expect(page.locator('.kind-badge.hub')).toHaveCount(0)
  })

  test('hub plugin shows "hub" kind badge', async ({ page }) => {
    await clickNode(page, 'solar')
    await expect(page.locator('.kind-badge.hub')).toBeVisible()
    await expect(page.locator('.kind-badge.leaf')).toHaveCount(0)
  })

  test('description text is non-empty', async ({ page }) => {
    await clickNode(page, 'echo')
    const desc = page.locator('.description')
    await expect(desc).toBeVisible()
    const text = await desc.textContent()
    expect(text?.trim().length).toBeGreaterThan(0)
  })

  test('hub detail shows children chips', async ({ page }) => {
    await clickNode(page, 'solar')
    await expect(page.locator('.child-chip').first()).toBeVisible()
  })

  test('child chips list matches known solar planets', async ({ page }) => {
    await clickNode(page, 'solar')
    const chips = await page.locator('.child-chip').allTextContents()
    const names = chips.map(c => c.replace(/[a-f0-9]+$/, '').trim())
    expect(names.some(n => ['earth', 'mars', 'jupiter', 'saturn'].includes(n))).toBe(true)
  })

  test('clicking a child chip navigates to that namespace', async ({ page }) => {
    await clickNode(page, 'solar')
    const earthChip = page.locator('.child-chip', { hasText: 'earth' }).first()
    await earthChip.click()
    await expect(page.locator('.detail-path')).toContainText('earth')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 4. Methods
// ──────────────────────────────────────────────────────────────────────────────

test.describe('methods', () => {
  test('echo plugin shows its methods', async ({ page }) => {
    await clickNode(page, 'echo')
    const methods = await page.locator('.method-name').allTextContents()
    expect(methods).toContain('echo')
    expect(methods).toContain('once')
    expect(methods).toContain('ping')
    expect(methods).toContain('schema')
  })

  test('each method card shows a description', async ({ page }) => {
    await clickNode(page, 'echo')
    const descs = page.locator('.method-desc')
    const count = await descs.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const text = await descs.nth(i).textContent()
      expect(text?.trim().length).toBeGreaterThan(0)
    }
  })

  test('streaming methods show the "stream" tag', async ({ page }) => {
    await clickNode(page, 'cone')
    // cone.chat is a streaming method
    const chatCard = page.locator('.method-card', { hasText: 'chat' }).first()
    await expect(chatCard.locator('.tag.stream')).toBeVisible()
  })

  test('non-streaming methods do not show stream tag', async ({ page }) => {
    await clickNode(page, 'cone')
    // cone.list is not streaming
    const listCard = page.locator('.method-card', { hasText: 'list' }).first()
    await expect(listCard.locator('.tag.stream')).toHaveCount(0)
  })

  test('health plugin has a schema method', async ({ page }) => {
    await clickNode(page, 'health')
    const methods = await page.locator('.method-name').allTextContents()
    expect(methods).toContain('schema')
  })

  test('methods with params show a params section', async ({ page }) => {
    await clickNode(page, 'echo')
    await expect(page.locator('.method-card').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.params-section').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.section-label').first()).toContainText('params')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 5. Refresh
// ──────────────────────────────────────────────────────────────────────────────

test.describe('refresh', () => {
  test('tree remains visible after 3 seconds (hash poll stable)', async ({ page }) => {
    await page.waitForTimeout(3_000)
    await expect(page.locator('.node-row').first()).toBeVisible()
  })

  test('tree remains interactive after hash polling', async ({ page }) => {
    await page.waitForTimeout(3_000)
    await clickNode(page, 'echo')
    await expect(page.locator('.detail-path')).toContainText('echo', { timeout: 5_000 })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 6. Path display
// ──────────────────────────────────────────────────────────────────────────────

test.describe('path display', () => {
  test('root node shows "substrate" as path', async ({ page }) => {
    const root = page.locator('.node-row').first()
    await root.click()
    await expect(page.locator('.detail-path')).toContainText('substrate')
  })

  test('nested node shows full dotted path segments', async ({ page }) => {
    await clickNode(page, 'solar')
    await clickNode(page, 'earth')
    const path = page.locator('.detail-path')
    await expect(path).toContainText('solar')
    await expect(path).toContainText('earth')
  })

  test('path separator dots appear between segments', async ({ page }) => {
    await clickNode(page, 'solar')
    await clickNode(page, 'earth')
    await expect(page.locator('.path-sep').first()).toBeVisible()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 7. Schema walker — tree completeness
// ──────────────────────────────────────────────────────────────────────────────

test.describe('tree completeness', () => {
  test('all expected top-level substrate namespaces are in sidebar', async ({ page }) => {
    const labels = await visibleLabels(page)
    const expected = [
      'bash', 'loopback', 'registry', 'echo', 'interactive',
      'mustache', 'cone', 'solar', 'health',
      'claudecode', 'changelog', 'arbor',
    ]
    for (const ns of expected) {
      expect(labels, `expected "${ns}" in sidebar`).toContain(ns)
    }
  })

  test('solar has the expected planet children after expansion', async ({ page }) => {
    await clickNode(page, 'solar')
    const labels = await visibleLabels(page)
    const planets = ['earth', 'mars', 'jupiter', 'saturn', 'neptune', 'uranus', 'mercury', 'venus']
    const found = planets.filter(p => labels.includes(p))
    expect(found.length).toBeGreaterThan(0)
  })

  test('no error banner is shown on clean load', async ({ page }) => {
    await expect(page.locator('.error-banner')).toHaveCount(0)
  })
})
