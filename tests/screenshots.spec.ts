/**
 * Screenshot capture tests — these don't assert, they just capture
 * the UI at key states so the developer can observe the result.
 */
import { test } from '@playwright/test'
import { fileURLToPath } from 'url'
import * as path from 'path'
import * as fs from 'fs'

const SHOTS_DIR = path.join(fileURLToPath(import.meta.url), '../../test-screenshots')

test.beforeAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
})

function shot(name: string) {
  return path.join(SHOTS_DIR, `${name}.png`)
}

test('01 — explorer initial load', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.node-row', { timeout: 15_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: shot('01-explorer-initial'), fullPage: false })
})

test('02 — echo plugin selected (method cards with schema hints)', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.node-row', { timeout: 15_000 })
  await page.locator('.node-row', { hasText: 'echo' }).first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: shot('02-echo-detail'), fullPage: false })
})

test('03 — echo method invoke open (form fields)', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.node-row', { timeout: 15_000 })
  await page.locator('.node-row', { hasText: 'echo' }).first().click()
  await page.waitForTimeout(600)
  // Open the first invoke panel
  const toggles = page.locator('.invoke-toggle')
  await toggles.first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: shot('03-invoke-open'), fullPage: false })
})

test('04 — canvas / forest view', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.node-row', { timeout: 15_000 })
  // Switch to canvas view
  await page.locator('.view-btn').nth(1).click()
  // Wait for canvas to appear and load
  await page.waitForSelector('.main-canvas', { timeout: 5_000 })
  await page.waitForTimeout(3_000)  // give tree time to load + render
  await page.screenshot({ path: shot('04-forest-canvas'), fullPage: false })
})
