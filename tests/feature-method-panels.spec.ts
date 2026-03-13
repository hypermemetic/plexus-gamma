/**
 * Feature tests for method-panel features:
 *   - BatchRunner
 *   - AssertionSuite
 *   - AgentTranscript
 *   - SchemaDiffBanner
 *
 * Prerequisites (already running in dev environment):
 *   - substrate on ws://127.0.0.1:4444
 *   - substrate has an `echo` plugin with an `echo` method (params: message, count)
 *   - substrate has a `claudecode` plugin with a `chat` method
 */

import { test, expect, type Page } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForTree(page: Page) {
  await expect(page.locator('.loading-state')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.node-row').first()).toBeVisible({ timeout: 15_000 })
}

async function clickNode(page: Page, label: string) {
  await page.locator('.node-row', { hasText: label }).first().click()
}

// Navigate to the `echo` plugin and wait for its method list to appear.
async function navigateToEcho(page: Page) {
  await page.goto('/')
  await waitForTree(page)
  await clickNode(page, 'echo')
  await expect(page.locator('.method-list').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.method-card').first()).toBeVisible({ timeout: 10_000 })
}

// Navigate to the `claudecode` plugin and wait for its method cards to appear.
async function navigateToClaudecode(page: Page) {
  await page.goto('/')
  await waitForTree(page)
  await clickNode(page, 'claudecode')
  await expect(page.locator('.method-card').first()).toBeVisible({ timeout: 10_000 })
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────
//
// BatchRunner is rendered as a sibling AFTER each MethodInvoker card inside
// .method-list.  Tests target the list rather than the individual .method-card.

test.describe('batch runner', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToEcho(page)
  })

  test('batch toggle button appears on method cards', async ({ page }) => {
    await expect(page.locator('.batch-toggle').first()).toBeVisible({ timeout: 10_000 })
  })

  test('batch panel is hidden by default', async ({ page }) => {
    await expect(page.locator('.batch-panel')).toHaveCount(0)
  })

  test('clicking batch toggle opens the batch panel', async ({ page }) => {
    await page.locator('.batch-toggle').first().click()
    await expect(page.locator('.batch-panel').first()).toBeVisible({ timeout: 10_000 })
  })

  test('batch panel has a textarea for JSON array input', async ({ page }) => {
    await page.locator('.batch-toggle').first().click()
    await expect(page.locator('.batch-textarea').first()).toBeVisible({ timeout: 10_000 })
  })

  test('batch panel has a concurrency input', async ({ page }) => {
    await page.locator('.batch-toggle').first().click()
    await expect(page.locator('.concurrency-input').first()).toBeVisible({ timeout: 10_000 })
  })

  test('batch panel has a run button', async ({ page }) => {
    await page.locator('.batch-toggle').first().click()
    await expect(page.locator('.batch-panel .run-btn').first()).toBeVisible({ timeout: 10_000 })
  })

  test('valid JSON array shows item count', async ({ page }) => {
    await page.locator('.batch-toggle').first().click()
    await page.locator('.batch-textarea').first().fill('[{"message":"hello"},{"message":"world"}]')
    await expect(page.locator('.batch-item-count').first()).toContainText('2 valid items', {
      timeout: 10_000,
    })
  })

  test('invalid JSON shows parse error', async ({ page }) => {
    await page.locator('.batch-toggle').first().click()
    await page.locator('.batch-textarea').first().fill('not valid json {{{')
    await expect(page.locator('.batch-parse-error').first()).toBeVisible({ timeout: 10_000 })
  })

  test('running batch executes all items', async ({ page }) => {
    await page.locator('.batch-toggle').first().click()
    await page.locator('.batch-textarea').first().fill('[{"message":"a"},{"message":"b"}]')
    await expect(page.locator('.batch-item-count').first()).toBeVisible({ timeout: 10_000 })
    await page.locator('.batch-panel .run-btn').first().click()
    await expect(page.locator('.batch-row').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.batch-row')).toHaveCount(2, { timeout: 20_000 })
    // Both rows should reach a terminal status (done or error)
    await expect(page.locator('.status-icon.done, .status-icon.error').first())
      .toBeVisible({ timeout: 20_000 })
  })

  test('batch results table appears after run', async ({ page }) => {
    await page.locator('.batch-toggle').first().click()
    await page.locator('.batch-textarea').first().fill('[{"message":"test"}]')
    await expect(page.locator('.batch-item-count').first()).toBeVisible({ timeout: 10_000 })
    await page.locator('.batch-panel .run-btn').first().click()
    await expect(page.locator('.batch-table').first()).toBeVisible({ timeout: 20_000 })
  })

  test('copy all results button appears after run', async ({ page }) => {
    await page.locator('.batch-toggle').first().click()
    await page.locator('.batch-textarea').first().fill('[{"message":"test"}]')
    await expect(page.locator('.batch-item-count').first()).toBeVisible({ timeout: 10_000 })
    await page.locator('.batch-panel .run-btn').first().click()
    await expect(page.locator('.status-icon.done, .status-icon.error').first())
      .toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.copy-results-btn').first()).toBeVisible({ timeout: 10_000 })
  })

  test('close button collapses batch panel', async ({ page }) => {
    await page.locator('.batch-toggle').first().click()
    await expect(page.locator('.batch-panel').first()).toBeVisible({ timeout: 10_000 })
    await page.locator('.batch-panel .close-btn').first().click()
    await expect(page.locator('.batch-panel')).toHaveCount(0)
    await expect(page.locator('.batch-toggle').first()).toBeVisible()
  })
})

// ─── Assertion Suite ──────────────────────────────────────────────────────────
//
// AssertionSuite is also a sibling of .method-card inside .method-list.

test.describe('assertion suite', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any persisted tests from a previous run
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('plexus-gamma:assertions'))
    await navigateToEcho(page)
  })

  test('assertion suite toggle appears on method cards', async ({ page }) => {
    await expect(page.locator('.suite-toggle').first()).toBeVisible({ timeout: 10_000 })
  })

  test('assertion panel is hidden by default', async ({ page }) => {
    await expect(page.locator('.suite-panel')).toHaveCount(0)
  })

  test('clicking toggle opens assertion panel', async ({ page }) => {
    await page.locator('.suite-toggle').first().click()
    await expect(page.locator('.suite-panel').first()).toBeVisible({ timeout: 10_000 })
  })

  test('new test button is visible', async ({ page }) => {
    await page.locator('.suite-toggle').first().click()
    await expect(page.locator('.new-test-btn').first()).toBeVisible({ timeout: 10_000 })
  })

  test('clicking new test shows test creation form', async ({ page }) => {
    await page.locator('.suite-toggle').first().click()
    await page.locator('.new-test-btn').first().click()
    await expect(page.locator('.new-test-form').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.new-test-name').first()).toBeVisible()
  })

  test('can create a new test case', async ({ page }) => {
    await page.locator('.suite-toggle').first().click()
    await page.locator('.new-test-btn').first().click()
    await page.locator('.new-test-name').first().fill('my-echo-test')
    await page.locator('.new-test-params').first().fill('{"message":"hello"}')
    await page.locator('.new-test-form .add-btn').first().click()
    await expect(page.locator('.test-name', { hasText: 'my-echo-test' }))
      .toBeVisible({ timeout: 10_000 })
  })

  test('test case shows run button', async ({ page }) => {
    await page.locator('.suite-toggle').first().click()
    await page.locator('.new-test-btn').first().click()
    await page.locator('.new-test-name').first().fill('run-btn-test')
    await page.locator('.new-test-params').first().fill('{"message":"hi"}')
    await page.locator('.new-test-form .add-btn').first().click()
    await expect(page.locator('.suite-panel .run-btn').first()).toBeVisible({ timeout: 10_000 })
  })

  test('can add an assertion to a test', async ({ page }) => {
    await page.locator('.suite-toggle').first().click()
    await page.locator('.new-test-btn').first().click()
    await page.locator('.new-test-name').first().fill('assertion-test')
    await page.locator('.new-test-params').first().fill('{"message":"hi"}')
    await page.locator('.new-test-form .add-btn').first().click()
    const testItem = page.locator('.test-item').first()
    await expect(testItem.locator('.test-body')).toBeVisible({ timeout: 10_000 })
    await testItem.locator('.add-assertion-btn').click()
    await expect(testItem.locator('.add-assertion-form')).toBeVisible({ timeout: 10_000 })
    await testItem.locator('.a-input').first().fill('type')
    await testItem.locator('.a-value-input').fill('text')
    await testItem.locator('.add-assertion-form .add-btn').click()
    await expect(testItem.locator('.assertion-row')).toBeVisible({ timeout: 10_000 })
  })

  test('assertion op select has expected options', async ({ page }) => {
    await page.locator('.suite-toggle').first().click()
    await page.locator('.new-test-btn').first().click()
    await page.locator('.new-test-name').first().fill('op-test')
    await page.locator('.new-test-params').first().fill('{}')
    await page.locator('.new-test-form .add-btn').first().click()
    const testItem = page.locator('.test-item').first()
    await expect(testItem.locator('.test-body')).toBeVisible({ timeout: 10_000 })
    await testItem.locator('.add-assertion-btn').click()
    const select = testItem.locator('.a-select')
    await expect(select).toBeVisible({ timeout: 10_000 })
    const options = await select.locator('option').allTextContents()
    expect(options).toContain('equals')
    expect(options).toContain('contains')
    expect(options).toContain('exists')
    expect(options).toContain('not_exists')
    expect(options).toContain('gt')
    expect(options).toContain('lt')
    expect(options).toContain('matches')
  })

  test('running a test shows a result badge', async ({ page }) => {
    await page.locator('.suite-toggle').first().click()
    await page.locator('.new-test-btn').first().click()
    await page.locator('.new-test-name').first().fill('invoke-test')
    await page.locator('.new-test-params').first().fill('{"message":"hello"}')
    await page.locator('.new-test-form .add-btn').first().click()
    const testItem = page.locator('.test-item').first()
    await testItem.locator('.run-btn').click()
    await expect(testItem.locator('.run-badge.pass, .run-badge.fail'))
      .toBeVisible({ timeout: 15_000 })
  })

  test('delete button removes a test case', async ({ page }) => {
    await page.locator('.suite-toggle').first().click()
    await page.locator('.new-test-btn').first().click()
    await page.locator('.new-test-name').first().fill('delete-me')
    await page.locator('.new-test-params').first().fill('{}')
    await page.locator('.new-test-form .add-btn').first().click()
    await expect(page.locator('.test-name', { hasText: 'delete-me' }))
      .toBeVisible({ timeout: 10_000 })
    await page.locator('.test-item').first().locator('.delete-btn').click()
    await expect(page.locator('.test-name', { hasText: 'delete-me' })).toHaveCount(0)
  })
})

// ─── Agent Transcript ─────────────────────────────────────────────────────────
//
// AgentTranscript renders only for methods named 'chat' (v-if guard in the
// component root).  Tests verify presence on claudecode.chat and absence on
// echo methods.

test.describe('agent transcript', () => {
  test('chat toggle button appears on the chat method only', async ({ page }) => {
    await navigateToClaudecode(page)
    const chatCard = page.locator('.method-card', { hasText: 'chat' }).first()
    await expect(chatCard).toBeVisible({ timeout: 10_000 })
    // AgentTranscript is a sibling; look for it after the chat method-card
    await expect(page.locator('.chat-toggle').first()).toBeVisible({ timeout: 10_000 })
  })

  test('non-chat methods do not show chat toggle', async ({ page }) => {
    await navigateToEcho(page)
    await expect(page.locator('.chat-toggle')).toHaveCount(0)
  })

  test('clicking chat toggle opens the chat panel', async ({ page }) => {
    await navigateToClaudecode(page)
    await expect(page.locator('.chat-toggle').first()).toBeVisible({ timeout: 10_000 })
    await page.locator('.chat-toggle').first().click()
    await expect(page.locator('.chat-panel').first()).toBeVisible({ timeout: 10_000 })
  })

  test('chat panel has a session name input', async ({ page }) => {
    await navigateToClaudecode(page)
    await page.locator('.chat-toggle').first().click()
    await expect(page.locator('.session-input').first()).toBeVisible({ timeout: 10_000 })
  })

  test('chat panel has a prompt input', async ({ page }) => {
    await navigateToClaudecode(page)
    await page.locator('.chat-toggle').first().click()
    await expect(page.locator('.prompt-input').first()).toBeVisible({ timeout: 10_000 })
  })

  test('chat panel has a send button', async ({ page }) => {
    await navigateToClaudecode(page)
    await page.locator('.chat-toggle').first().click()
    await expect(page.locator('.send-btn').first()).toBeVisible({ timeout: 10_000 })
  })

  test('send button is disabled when prompt is empty', async ({ page }) => {
    await navigateToClaudecode(page)
    await page.locator('.chat-toggle').first().click()
    await expect(page.locator('.send-btn').first()).toBeDisabled({ timeout: 10_000 })
  })
})

// ─── Schema Diff Banner ───────────────────────────────────────────────────────

test.describe('schema diff banner', () => {
  test('schema diff banner is not visible on initial load', async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
    await expect(page.locator('.diff-banner')).toHaveCount(0)
  })

  test('banner does not appear during normal operation', async ({ page }) => {
    await page.goto('/')
    await waitForTree(page)
    await page.waitForTimeout(3_000)
    await expect(page.locator('.diff-banner')).toHaveCount(0)
  })
})
