/**
 * Headless Playwright browser controller.
 *
 * Launches a Chromium instance pointing at the Vite dev server.
 * The Vue app connects to ws://localhost:44707/bridge automatically on load,
 * establishing the bridge so RPC method calls can drive the UI.
 *
 * After each state-changing RPC action, call `screenshot()` to capture the
 * current UI. Frames are saved under `screenshots/` with a timestamp + name.
 */

import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'

let browser: Browser | null = null
let page: Page | null = null

const SCREENSHOTS_DIR = 'screenshots'

/** Start the headless browser and navigate to the app URL.
 *  Resolves once the page has loaded (does not wait for bridge — that
 *  happens asynchronously as the Vue app mounts and connects to /bridge). */
export async function startHeadless(url = 'http://localhost:8080'): Promise<void> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true })

  browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  page = await ctx.newPage()

  await page.goto(url)
  console.log(`[headless] browser navigated to ${url}`)

  // Take an initial screenshot once the app shell loads
  await page.waitForLoadState('networkidle').catch(() => {})
  await screenshot('startup')
}

/** Take a screenshot and save it to the screenshots/ directory.
 *  @param label  Optional label appended to the filename (default: 'action')
 *  @returns      Absolute path to the saved screenshot file */
export async function screenshot(label = 'action'): Promise<string> {
  if (!page) return '[headless] no browser'
  const filename = `${Date.now()}-${label}.png`
  const filepath = join(SCREENSHOTS_DIR, filename)
  await page.screenshot({ path: filepath })
  return filepath
}

/** Whether the headless browser is currently running. */
export function isHeadlessReady(): boolean {
  return page !== null
}

/** Stop the headless browser. */
export async function stopHeadless(): Promise<void> {
  await browser?.close()
  browser = null
  page = null
}
