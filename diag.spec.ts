import { test } from '@playwright/test'
test('diag', async ({ page }) => {
  const logs: string[] = []
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`))
  await page.goto('/')
  await page.waitForTimeout(8000)
  for (const l of logs) console.log(l)
  const banner = await page.locator('.error-banner').textContent().catch(() => null)
  if (banner) console.log('ERROR BANNER:', banner)
  console.log('loading-state count:', await page.locator('.loading-state').count())
  console.log('node-row count:', await page.locator('.node-row').count())
})
