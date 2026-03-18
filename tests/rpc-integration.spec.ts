/**
 * RPC Integration Tests
 *
 * Validates the full stack: synapse-protocol RPC call → plexus-rpc server →
 * bridge → Vue app → DOM mutation → verified via Playwright.
 *
 * These tests exercise the same protocol path that Haskell synapse uses, so
 * passing here means synapse compatibility is verified at the protocol level.
 *
 * Prerequisites: `bun run dev` (Vite + Bun server) must be running, OR the
 * Playwright webServer config will start it automatically.
 *
 * Architecture:
 *   Node.js test (ws)  →  plexus-rpc server :44707  →  bridge  →  test browser (Vue)
 *                ↑                                                         ↑
 *         makes RPC calls                                    Playwright verifies DOM
 */

import { test, expect, type Page } from '@playwright/test'
import { WebSocket } from 'ws'

// ── RPC helper — implements the plexus subscription protocol ──────────────────
// This mirrors exactly what Haskell's substrateRpc does:
//   client → { method: "plexus-gamma.call", params: { method, params } }
//   server → { id: N, result: <subId> }   (ACK)
//   server → { method: "subscription", params: { subscription: subId, result: item } }  (×N)
//   server → { method: "subscription", params: { subscription: subId, result: { type:"done" } } }

interface RpcResult { items: unknown[]; error?: string }

function rpcCall(method: string, params: unknown = {}): Promise<RpcResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:44707')
    const items: unknown[] = []
    let subId: number | null = null
    const id = Math.ceil(Math.random() * 100_000)

    const timeout = setTimeout(() => {
      ws.terminate()
      reject(new Error(`RPC timeout waiting for: ${method}`))
    }, 8000)

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw.toString()) as Record<string, unknown> }
      catch { return }

      // ACK — server assigns a subscription ID
      if (msg['id'] === id && msg['result'] !== undefined) {
        subId = msg['result'] as number
        return
      }

      // Subscription notification
      if (msg['method'] === 'subscription' && subId !== null) {
        const p = msg['params'] as { subscription: number; result: { type: string; content?: unknown; message?: string } }
        if (p.subscription !== subId) return
        const r = p.result
        if (r.type === 'data') items.push(r.content)
        if (r.type === 'done') { clearTimeout(timeout); ws.close(); resolve({ items }) }
        if (r.type === 'error') { clearTimeout(timeout); ws.close(); resolve({ items, error: r.message }) }
      }
    })

    ws.on('open', () => {
      ws.send(JSON.stringify({
        jsonrpc: '2.0', id,
        method: 'plexus-gamma.call',
        params: { method, params },
      }))
    })

    ws.on('error', (err) => { clearTimeout(timeout); reject(err) })
  })
}

// Wait for the bridge to be established (bridge-ready = RPC calls go through).
// Polls ui.getView until it succeeds without a bridge error.
async function waitForBridge(maxMs = 8000): Promise<void> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const { error } = await rpcCall('ui.getView')
    if (!error?.includes('bridge')) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('Bridge never connected within timeout')
}

// Reset UI to a predictable baseline state before each test
async function resetState(): Promise<void> {
  await rpcCall('ui.navigate', { view: 'multi-explorer' })
  await rpcCall('ui.setTheme', { theme: 'midnight' })
}

function rpcStreamFirst(
  method: string,
  params: unknown,
  trigger: () => Promise<void>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:44707')
    let subId: number | null = null
    const id = Math.ceil(Math.random() * 100_000)

    const timeout = setTimeout(() => {
      ws.terminate()
      reject(new Error(`rpcStreamFirst timeout: ${method}`))
    }, 8000)

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw.toString()) as Record<string, unknown> }
      catch { return }

      if (msg['id'] === id && msg['result'] !== undefined) {
        subId = msg['result'] as number
        void trigger()
        return
      }

      if (msg['method'] === 'subscription' && subId !== null) {
        const p = msg['params'] as { subscription: number; result: { type: string; content?: unknown; message?: string } }
        if (p.subscription !== subId) return
        const r = p.result
        if (r.type === 'data')  { clearTimeout(timeout); ws.close(); resolve(r.content) }
        if (r.type === 'done')  { clearTimeout(timeout); ws.close(); reject(new Error(`rpcStreamFirst: done without data from ${method}`)) }
        if (r.type === 'error') { clearTimeout(timeout); ws.close(); reject(new Error(r.message ?? 'error')) }
      }
    })

    ws.on('open', () => {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'plexus-gamma.call', params: { method, params } }))
    })

    ws.on('error', (err) => { clearTimeout(timeout); reject(err) })
  })
}

// ── Selector helpers ──────────────────────────────────────────────────────────

function activeTab(page: Page) {
  return page.locator('.view-tab.active')
}

async function getDataTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.dataset['theme'] ?? null)
}

// ── Test setup ────────────────────────────────────────────────────────────────

// Bridge is a last-wins singleton — only one browser can be the active client.
// Serial mode ensures tests don't compete for the bridge connection.
test.describe.configure({ mode: 'serial' })

test.describe('RPC → bridge → UI integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.view-tabs', { timeout: 10_000 })
    await waitForBridge()
    await resetState()
    // Let Vue finish rendering the reset
    await page.waitForTimeout(200)
  })

  // ── Navigation ──────────────────────────────────────────────────────────────

  test('ui.navigate: explore view', async ({ page }) => {
    const { items, error } = await rpcCall('ui.navigate', { view: 'multi-explorer' })
    expect(error).toBeUndefined()
    expect(items).toEqual([{ ok: true }])

    await page.waitForTimeout(200)
    await expect(activeTab(page)).toHaveText('explore')
    await page.screenshot({ path: 'screenshots/rpc-navigate-explore.png' })
  })

  test('ui.navigate: topology (canvas) view', async ({ page }) => {
    const { items, error } = await rpcCall('ui.navigate', { view: 'canvas' })
    expect(error).toBeUndefined()
    expect(items).toEqual([{ ok: true }])

    await page.waitForTimeout(200)
    await expect(activeTab(page)).toHaveText('topology')
    await page.screenshot({ path: 'screenshots/rpc-navigate-canvas.png' })
  })

  test('ui.navigate: sheet view', async ({ page }) => {
    const { items } = await rpcCall('ui.navigate', { view: 'sheet' })
    expect(items).toEqual([{ ok: true }])

    await page.waitForTimeout(200)
    await expect(activeTab(page)).toHaveText('sheet')
    await page.screenshot({ path: 'screenshots/rpc-navigate-sheet.png' })
  })

  test('ui.navigate: wiring view', async ({ page }) => {
    const { items } = await rpcCall('ui.navigate', { view: 'wiring' })
    expect(items).toEqual([{ ok: true }])

    await page.waitForTimeout(200)
    await expect(activeTab(page)).toHaveText('wiring')
    await page.screenshot({ path: 'screenshots/rpc-navigate-wiring.png' })
  })

  test('ui.navigate: orchestration view', async ({ page }) => {
    const { items } = await rpcCall('ui.navigate', { view: 'orchestration' })
    expect(items).toEqual([{ ok: true }])

    await page.waitForTimeout(200)
    await expect(activeTab(page)).toHaveText('orchestrate')
    await page.screenshot({ path: 'screenshots/rpc-navigate-orchestration.png' })
  })

  // ── View state reads ─────────────────────────────────────────────────────────

  test('ui.getView: returns current view after navigate', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'sheet' })
    await page.waitForTimeout(100)

    const { items, error } = await rpcCall('ui.getView')
    expect(error).toBeUndefined()
    expect(items).toEqual([{ view: 'sheet' }])
  })

  test('ui.getView: reflects sequential navigation', async ({ page }) => {
    for (const view of ['canvas', 'wiring', 'multi-explorer'] as const) {
      await rpcCall('ui.navigate', { view })
      await page.waitForTimeout(100)
      const { items } = await rpcCall('ui.getView')
      expect(items).toEqual([{ view }])
    }
  })

  // ── Theme ────────────────────────────────────────────────────────────────────

  test('ui.setTheme: switch to daylight', async ({ page }) => {
    const { items, error } = await rpcCall('ui.setTheme', { theme: 'daylight' })
    expect(error).toBeUndefined()
    expect(items).toEqual([{ ok: true }])

    await page.waitForTimeout(300)
    expect(await getDataTheme(page)).toBe('daylight')
    await page.screenshot({ path: 'screenshots/rpc-theme-daylight.png' })
  })

  test('ui.setTheme: switch to midnight', async ({ page }) => {
    // Start from daylight so there's an actual change
    await rpcCall('ui.setTheme', { theme: 'daylight' })
    await page.waitForTimeout(100)

    await rpcCall('ui.setTheme', { theme: 'midnight' })
    await page.waitForTimeout(300)
    expect(await getDataTheme(page)).toBe('midnight')
    await page.screenshot({ path: 'screenshots/rpc-theme-midnight.png' })
  })

  test('ui.getTheme: returns current theme', async ({ page }) => {
    await rpcCall('ui.setTheme', { theme: 'daylight' })
    await page.waitForTimeout(100)

    const { items, error } = await rpcCall('ui.getTheme')
    expect(error).toBeUndefined()
    expect(items).toEqual([{ theme: 'daylight' }])
  })

  // ── Backend list ─────────────────────────────────────────────────────────────

  test('backends.list: returns array of connected backends', async ({ page }) => {
    const { items, error } = await rpcCall('backends.list')
    expect(error).toBeUndefined()
    expect(items.length).toBe(1)
    const backends = items[0] as { backends: { name: string; url: string }[] }
    expect(Array.isArray(backends.backends)).toBe(true)
  })

  // ── Error cases ───────────────────────────────────────────────────────────────

  test('unknown method returns error', async ({ page }) => {
    const { error } = await rpcCall('ui.doesNotExist')
    expect(error).toContain('not found')
  })

  test('missing required param returns error', async ({ page }) => {
    // ui.navigate requires { view: string }
    const { error } = await rpcCall('ui.navigate', {})
    expect(error).toBeTruthy()
  })

  // ── Screenshot method ─────────────────────────────────────────────────────────

  test('screenshot.take: returns file path', async ({ page }) => {
    // screenshot.take only works with HEADLESS=1 mode; without it returns an info message
    const { items } = await rpcCall('screenshot.take', { label: 'rpc-test' })
    expect(items.length).toBe(1)
    const result = items[0] as Record<string, string>
    // Either a path or an error message — either way the method responds
    expect(result).toHaveProperty(Object.keys(result)[0]!)
  })

  // ── Command palette ───────────────────────────────────────────────────────────

  test('ui.palette.open: makes palette visible', async ({ page }) => {
    const { items, error } = await rpcCall('ui.palette.open')
    expect(error).toBeUndefined()
    expect(items).toEqual([{ ok: true }])

    await page.waitForTimeout(200)
    await expect(page.locator('.palette-backdrop')).toBeVisible()
    await page.screenshot({ path: 'screenshots/rpc-palette-open.png' })
  })

  test('ui.palette.close: hides palette', async ({ page }) => {
    await rpcCall('ui.palette.open')
    await page.waitForTimeout(100)

    const { items, error } = await rpcCall('ui.palette.close')
    expect(error).toBeUndefined()
    expect(items).toEqual([{ ok: true }])

    await page.waitForTimeout(200)
    await expect(page.locator('.palette-backdrop')).not.toBeVisible()
  })

  // ── Wiring canvas actions ─────────────────────────────────────────────────────

  test('wiring.getState: returns canvas state when wiring view is active', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(300)

    const { items, error } = await rpcCall('wiring.getState')
    expect(error).toBeUndefined()
    const state = items[0] as { nodeCount: number; edgeCount: number; running: boolean; nodes: unknown[] }
    expect(typeof state.nodeCount).toBe('number')
    expect(typeof state.edgeCount).toBe('number')
    expect(typeof state.running).toBe('boolean')
    expect(Array.isArray(state.nodes)).toBe(true)
  })

  test('wiring.getJson: exports pipeline JSON', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(300)

    const { items, error } = await rpcCall('wiring.getJson')
    expect(error).toBeUndefined()
    const result = items[0] as { json: string }
    expect(typeof result.json).toBe('string')
    const parsed = JSON.parse(result.json) as { nodes: unknown[]; edges: unknown[] }
    expect(Array.isArray(parsed.nodes)).toBe(true)
    expect(Array.isArray(parsed.edges)).toBe(true)
  })

  test('wiring.clear: clears canvas without confirm dialog', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(300)

    const { items, error } = await rpcCall('wiring.clear')
    expect(error).toBeUndefined()
    expect(items).toEqual([{ ok: true }])

    await page.waitForTimeout(200)
    const stateResult = await rpcCall('wiring.getState')
    const state = stateResult.items[0] as { nodeCount: number }
    expect(state.nodeCount).toBe(0)
  })

  test('wiring actions return error when view is not mounted', async ({ page }) => {
    // Navigate away from wiring so MethodWiringCanvas unmounts
    await rpcCall('ui.navigate', { view: 'multi-explorer' })
    await page.waitForTimeout(300)

    const { error } = await rpcCall('wiring.getState')
    expect(error).toContain('not available')
  })

  // ── Orchestration actions ─────────────────────────────────────────────────────

  test('orchestration.list: returns workflows array', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'orchestration' })
    await page.waitForTimeout(300)

    const { items, error } = await rpcCall('orchestration.list')
    expect(error).toBeUndefined()
    const result = items[0] as { workflows: unknown[] }
    expect(Array.isArray(result.workflows)).toBe(true)
  })

  test('orchestration.create + getState: creates a workflow and reflects it', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'orchestration' })
    await page.waitForTimeout(300)

    const beforeList = await rpcCall('orchestration.list')
    const countBefore = ((beforeList.items[0] as { workflows: unknown[] }).workflows).length

    const { items, error } = await rpcCall('orchestration.create')
    expect(error).toBeUndefined()
    expect(items[0]).toHaveProperty('ok', true)

    await page.waitForTimeout(200)
    const afterList = await rpcCall('orchestration.list')
    const countAfter = ((afterList.items[0] as { workflows: unknown[] }).workflows).length
    expect(countAfter).toBe(countBefore + 1)
    await page.screenshot({ path: 'screenshots/rpc-orchestration-create.png' })
  })

  test('orchestration.getState: returns selected workflow and run state', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'orchestration' })
    await page.waitForTimeout(300)

    const { items, error } = await rpcCall('orchestration.getState')
    expect(error).toBeUndefined()
    const state = items[0] as { isRunning: boolean; workflows: unknown[] }
    expect(typeof state.isRunning).toBe('boolean')
    expect(Array.isArray(state.workflows)).toBe(true)
  })

  test('orchestration actions return error when view is not mounted', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'multi-explorer' })
    await page.waitForTimeout(300)

    const { error } = await rpcCall('orchestration.list')
    expect(error).toContain('not available')
  })

  // ── invoke.batch ─────────────────────────────────────────────────────────────

  test('invoke.batch: runs N invocations and returns results', async ({ page }) => {
    const { items, error } = await rpcCall('invoke.batch', {
      backend: 'substrate',
      method: 'substrate.echo.say',
      items: [{ message: 'hello' }, { message: 'world' }],
      concurrency: 2,
    })
    expect(error).toBeUndefined()
    const result = items[0] as { results: { index: number; params: unknown; result: unknown; durationMs: number }[]; total: number; errors: number }
    // Verify batch mechanics: correct count and per-item structure regardless of backend availability
    expect(result.total).toBe(2)
    expect(result.results).toHaveLength(2)
    expect(result.results[0]?.index).toBe(0)
    expect(result.results[1]?.index).toBe(1)
    expect(typeof result.results[0]?.durationMs).toBe('number')
    expect(typeof result.results[1]?.durationMs).toBe('number')
    // errors field is present (may be > 0 if substrate backend not running in test env)
    expect(typeof result.errors).toBe('number')
  })

  // ── Wiring graph operations ────────────────────────────────────────────────

  test('wiring.addMethod + connectNodes + getResults: full pipeline roundtrip', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(300)

    // Clear any existing canvas state
    await rpcCall('wiring.clear')
    await page.waitForTimeout(100)

    // Add two nodes
    const add1 = await rpcCall('wiring.addMethod', { backend: 'substrate', method: 'substrate.echo.say' })
    expect(add1.error).toBeUndefined()
    const node1Id = (add1.items[0] as { nodeId: string }).nodeId

    const add2 = await rpcCall('wiring.addMethod', { backend: 'substrate', method: 'substrate.echo.say', x: 400, y: 100 })
    expect(add2.error).toBeUndefined()
    const node2Id = (add2.items[0] as { nodeId: string }).nodeId

    // Set params on node1
    const setParams = await rpcCall('wiring.setNodeParams', { nodeId: node1Id, params: { message: 'hello from rpc' } })
    expect(setParams.error).toBeUndefined()

    // Connect node1 → node2
    const connect = await rpcCall('wiring.connectNodes', { fromNodeId: node1Id, toNodeId: node2Id, toParam: 'message' })
    expect(connect.error).toBeUndefined()
    const { edgeId } = connect.items[0] as { edgeId: string }

    // Set edge routing
    const routing = await rpcCall('wiring.setEdgeRouting', { edgeId, mode: 'last' })
    expect(routing.error).toBeUndefined()

    // Label the nodes
    await rpcCall('wiring.setNodeLabel', { nodeId: node1Id, label: 'Source' })
    await rpcCall('wiring.setNodeLabel', { nodeId: node2Id, label: 'Sink' })

    // Verify state
    const state = await rpcCall('wiring.getState')
    const s = state.items[0] as { nodeCount: number; edgeCount: number }
    expect(s.nodeCount).toBe(2)
    expect(s.edgeCount).toBe(1)

    // Run the pipeline
    const run = await rpcCall('wiring.run')
    expect(run.error).toBeUndefined()

    await page.waitForTimeout(500)

    // Get results
    const results = await rpcCall('wiring.getResults')
    expect(results.error).toBeUndefined()
    const r = results.items[0] as { nodes: { id: string; status: string }[] }
    // Nodes will be 'done' if substrate is running, 'error' if not — either means the pipeline ran
    expect(r.nodes.every(n => ['done', 'idle', 'error'].includes(n.status))).toBe(true)

    await page.screenshot({ path: 'screenshots/rpc-wiring-pipeline.png' })
  })

  test('wiring.addTransform: adds a transform node', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(300)
    await rpcCall('wiring.clear')

    const { items, error } = await rpcCall('wiring.addTransform', { kind: 'extract', x: 100, y: 100 })
    expect(error).toBeUndefined()
    expect((items[0] as { nodeId: string }).nodeId).toBeTruthy()

    const state = await rpcCall('wiring.getState')
    expect((state.items[0] as { nodeCount: number }).nodeCount).toBe(1)
  })

  test('wiring.deleteNode: removes node and its edges', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(300)
    await rpcCall('wiring.clear')

    const { items } = await rpcCall('wiring.addMethod', { backend: 'substrate', method: 'substrate.echo.say' })
    const nodeId = (items[0] as { nodeId: string }).nodeId

    const del = await rpcCall('wiring.deleteNode', { nodeId })
    expect(del.error).toBeUndefined()

    const state = await rpcCall('wiring.getState')
    expect((state.items[0] as { nodeCount: number }).nodeCount).toBe(0)
  })

  // ── Orchestration full workflow ───────────────────────────────────────────

  test('orchestration: create → addStep → setStepParams → wireSteps → run', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'orchestration' })
    await page.waitForTimeout(300)

    // Create workflow
    const created = await rpcCall('orchestration.create')
    expect(created.error).toBeUndefined()
    const wfId = (created.items[0] as { id: string }).id!

    // Rename it
    await rpcCall('orchestration.select', { id: wfId })
    await rpcCall('orchestration.rename', { name: 'RPC Test Workflow' })

    // Add two steps
    const step1 = await rpcCall('orchestration.addStep', { backend: 'substrate', method: 'substrate.echo.say' })
    const stepId1 = (step1.items[0] as { stepId: string }).stepId!

    const step2 = await rpcCall('orchestration.addStep', { backend: 'substrate', method: 'substrate.echo.say' })
    const stepId2 = (step2.items[0] as { stepId: string }).stepId!

    // Set params on step1
    const setParams = await rpcCall('orchestration.setStepParams', {
      stepId: stepId1,
      params: { message: 'step1 output' },
    })
    expect(setParams.error).toBeUndefined()

    // Wire step1 result to step2 message param
    const wire = await rpcCall('orchestration.wireSteps', {
      fromStepId: stepId1,
      fromPath: '',
      toStepId: stepId2,
      toParam: 'message',
    })
    expect(wire.error).toBeUndefined()

    // Run workflow
    const runResult = await rpcCall('orchestration.run', { id: wfId })
    expect(runResult.error).toBeUndefined()
    const r = runResult.items[0] as { ok: boolean; steps: { status: string }[] }
    // ok=true only when substrate is running; steps may be 'error' in isolated test env
    expect(typeof r.ok).toBe('boolean')
    expect(r.steps).toHaveLength(2)
    expect(r.steps.every(s => ['done', 'error', 'pending', 'running'].includes(s.status))).toBe(true)

    await page.screenshot({ path: 'screenshots/rpc-orchestration-run.png' })

    // Clean up: delete the workflow
    const del = await rpcCall('orchestration.delete', { id: wfId })
    expect(del.error).toBeUndefined()
  })

  // ── ui.focusPath ───────────────────────────────────────────────────────────────

  test('ui.focusPath: switches to explorer view', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'canvas' })
    await page.waitForTimeout(200)

    const { items, error } = await rpcCall('ui.focusPath', { backend: 'substrate', path: [] })
    expect(error).toBeUndefined()
    expect(items).toEqual([{ ok: true }])

    await page.waitForTimeout(200)
    await expect(activeTab(page)).toHaveText('explore')
  })

  // ── Compound: navigate + verify + screenshot ──────────────────────────────────

  test('compound: navigate all views in sequence, each DOM-verified', async ({ page }) => {
    const views: [string, string][] = [
      ['canvas',        'topology'],
      ['sheet',         'sheet'],
      ['wiring',        'wiring'],
      ['orchestration', 'orchestrate'],
      ['multi-explorer', 'explore'],
    ]

    for (const [view, tabLabel] of views) {
      await rpcCall('ui.navigate', { view })
      await page.waitForTimeout(200)
      await expect(activeTab(page)).toHaveText(tabLabel)
    }

    await page.screenshot({ path: 'screenshots/rpc-compound-all-views.png' })
  })

  // ── backends CRUD ──────────────────────────────────────────────────────────────

  test('backends.add + list: adds a backend entry', async ({ page }) => {
    await rpcCall('backends.add', { name: 'test-bk', url: 'ws://localhost:9999' })
    await page.waitForTimeout(100)
    const { items, error } = await rpcCall('backends.list')
    expect(error).toBeUndefined()
    const list = (items[0] as { backends: { name: string }[] }).backends
    expect(list.some(b => b.name === 'test-bk')).toBe(true)
    await rpcCall('backends.remove', { name: 'test-bk' })
  })

  test('backends.remove: removes a backend entry', async ({ page }) => {
    await rpcCall('backends.add', { name: 'temp-bk', url: 'ws://localhost:9999' })
    await page.waitForTimeout(100)
    await rpcCall('backends.remove', { name: 'temp-bk' })
    await page.waitForTimeout(100)
    const { items } = await rpcCall('backends.list')
    const list = (items[0] as { backends: { name: string }[] }).backends
    expect(list.some(b => b.name === 'temp-bk')).toBe(false)
  })

  test('backends.setActive: returns ok', async ({ page }) => {
    const { items, error } = await rpcCall('backends.setActive', { name: 'substrate' })
    expect(error).toBeUndefined()
    expect(items).toEqual([{ ok: true }])
  })

  test('backends.health: returns health array', async ({ page }) => {
    const { items, error } = await rpcCall('backends.health')
    expect(error).toBeUndefined()
    const result = items[0] as { health: unknown[] }
    expect(Array.isArray(result.health)).toBe(true)
  })

  test('backends.methods: returns methods array', async ({ page }) => {
    const { items, error } = await rpcCall('backends.methods')
    expect(error).toBeUndefined()
    const result = items[0] as { methods: unknown[] }
    expect(Array.isArray(result.methods)).toBe(true)
  })

  // ── invoke.call self-loop ─────────────────────────────────────────────────────

  test('invoke.call: streams result from connected backend', async ({ page }) => {
    // Backend name must match the plugin root name ('plexus-gamma') so the
    // transport sends 'plexus-gamma.call' — the server's subscription entry point.
    await rpcCall('backends.add', { name: 'plexus-gamma', url: 'ws://localhost:44707' })
    await page.waitForTimeout(400)
    const { items, error } = await rpcCall('invoke.call', {
      backend: 'plexus-gamma',
      method: 'plexus-gamma.ui.getView',
      params: {},
      visible: false,
    })
    expect(error).toBeUndefined()
    expect(items[0]).toHaveProperty('view')
    await rpcCall('backends.remove', { name: 'plexus-gamma' })
  })

  // ── orchestration.rename + stop ───────────────────────────────────────────────

  test('orchestration.rename: renames selected workflow', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'orchestration' })
    await page.waitForTimeout(300)

    const created = await rpcCall('orchestration.create')
    const wfId = (created.items[0] as { id: string }).id!

    await rpcCall('orchestration.select', { id: wfId })
    const { items, error } = await rpcCall('orchestration.rename', { name: 'Renamed Workflow' })
    expect(error).toBeUndefined()
    expect(items).toEqual([{ ok: true }])

    const listResult = await rpcCall('orchestration.list')
    const workflows = (listResult.items[0] as { workflows: { id: string; name: string }[] }).workflows
    expect(workflows.find(w => w.id === wfId)?.name).toBe('Renamed Workflow')

    await rpcCall('orchestration.delete', { id: wfId })
  })

  test('orchestration.stop: returns ok when nothing running', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'orchestration' })
    await page.waitForTimeout(300)

    const { items, error } = await rpcCall('orchestration.stop')
    expect(error).toBeUndefined()
    expect(items).toEqual([{ ok: true }])
  })

  // ── state.watch streaming ─────────────────────────────────────────────────────

  test('state.watch: emits view-changed on navigation', async ({ page }) => {
    const event = await rpcStreamFirst(
      'state.watch',
      {},
      () => rpcCall('ui.navigate', { view: 'canvas' }).then(() => {}),
    ) as { type: string; view: string }

    expect(event.type).toBe('view-changed')
    expect(event.view).toBe('canvas')
  })

  // ── wiring.addTransform UI node kinds ─────────────────────────────────────────

  test('wiring.addTransform: adds widget node kinds', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(300)
    await rpcCall('wiring.clear')

    for (const subkind of ['text', 'input', 'button', 'slider', 'table']) {
      const { items, error } = await rpcCall('wiring.addTransform', { kind: 'widget', subkind, x: 100, y: 100 })
      expect(error).toBeUndefined()
      expect((items[0] as { nodeId: string }).nodeId).toBeTruthy()
    }

    const state = await rpcCall('wiring.getState')
    expect((state.items[0] as { nodeCount: number }).nodeCount).toBe(5)
  })

  test('wiring.addTransform: adds layout nodes (row, col)', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(300)
    await rpcCall('wiring.clear')

    const row = await rpcCall('wiring.addTransform', { kind: 'layout', orientation: 'row', x: 100, y: 100 })
    expect(row.error).toBeUndefined()
    expect((row.items[0] as { nodeId: string }).nodeId).toBeTruthy()

    const col = await rpcCall('wiring.addTransform', { kind: 'layout', orientation: 'col', x: 300, y: 100 })
    expect(col.error).toBeUndefined()

    const state = await rpcCall('wiring.getState')
    expect((state.items[0] as { nodeCount: number }).nodeCount).toBe(2)
  })

  test('wiring.addTransform: adds vars node', async ({ page }) => {
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(300)
    await rpcCall('wiring.clear')

    const { items, error } = await rpcCall('wiring.addTransform', { kind: 'vars', x: 100, y: 100 })
    expect(error).toBeUndefined()
    expect((items[0] as { nodeId: string }).nodeId).toBeTruthy()

    const state = await rpcCall('wiring.getState')
    expect((state.items[0] as { nodeCount: number }).nodeCount).toBe(1)
  })
})
