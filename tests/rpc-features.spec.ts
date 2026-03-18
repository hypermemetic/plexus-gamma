/**
 * RPC Features Documentation Generator
 *
 * This spec is a living screenshot harness. Every meaningful RPC-invokable
 * behaviour is exercised here. After all tests run, afterAll writes
 * docs/architecture/rpc-features.md — a full feature reference with every
 * screenshot embedded inline.
 *
 * The key primitive is `capture()`: it wraps every RPC call, waits for Vue to
 * settle, saves a viewport screenshot, and records metadata for the doc writer.
 *
 * Run: bun run docs:rpc
 */

import { test, expect, type Page } from '@playwright/test'
import { WebSocket } from 'ws'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ── Paths ──────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const SHOTS_DIR = path.join(ROOT, 'docs', 'screenshots', 'rpc')
const DOC_PATH  = path.join(ROOT, 'docs', 'architecture', 'rpc-features.md')

// ── RPC wire protocol ──────────────────────────────────────────────────────────

interface RpcResult { items: unknown[]; error?: string }

function rpcCall(method: string, params: unknown = {}): Promise<RpcResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:44707')
    const items: unknown[] = []
    let subId: number | null = null
    const id = Math.ceil(Math.random() * 100_000)
    const timeout = setTimeout(() => { ws.terminate(); reject(new Error(`RPC timeout: ${method}`)) }, 10_000)

    ws.on('message', raw => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw.toString()) as Record<string, unknown> } catch { return }
      if (msg['id'] === id && msg['result'] !== undefined) { subId = msg['result'] as number; return }
      if (msg['method'] === 'subscription' && subId !== null) {
        const p = msg['params'] as { subscription: number; result: { type: string; content?: unknown; message?: string } }
        if (p.subscription !== subId) return
        const r = p.result
        if (r.type === 'data')  items.push(r.content)
        if (r.type === 'done')  { clearTimeout(timeout); ws.close(); resolve({ items }) }
        if (r.type === 'error') { clearTimeout(timeout); ws.close(); resolve({ items, error: r.message }) }
      }
    })
    ws.on('open', () => {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'plexus-gamma.call', params: { method, params } }))
    })
    ws.on('error', err => { clearTimeout(timeout); reject(err) })
  })
}

async function waitForBridge(maxMs = 10_000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const { error } = await rpcCall('ui.getView')
    if (!error?.includes('bridge')) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('Bridge never connected')
}

// ── Capture infrastructure ─────────────────────────────────────────────────────
//
// capture() is the "screenshot callback on method invocation" requested by the user.
// Every RPC call in this spec goes through it. It:
//   1. Makes the RPC call
//   2. Waits `waitMs` for Vue to re-render
//   3. Saves a viewport PNG
//   4. Records metadata for the doc writer

interface Capture {
  section:    string
  id:         string      // unique slug, used as filename
  title:      string      // brief feature name
  method:     string      // RPC method invoked
  params:     string      // JSON params
  result:     string      // first item or error, truncated
  caption:    string      // doc caption explaining what is shown
  screenshot: string | null  // relative path from docs/architecture/
}

const captures: Capture[] = []
let currentSection = 'General'

function section(name: string) { currentSection = name }

async function capture(
  page: Page,
  id: string,
  title: string,
  method: string,
  params: unknown,
  caption: string,
  waitMs = 400,
): Promise<RpcResult> {
  const result = await rpcCall(method, params)
  await page.waitForTimeout(waitMs)

  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  const shotPath = path.join(SHOTS_DIR, `${id}.png`)
  await page.screenshot({ path: shotPath })

  const summary = result.error
    ? `Error: ${result.error}`
    : JSON.stringify(result.items[0] ?? null).slice(0, 120)

  captures.push({
    section: currentSection,
    id, title, method,
    params:     JSON.stringify(params, null, 2),
    result:     summary,
    caption,
    screenshot: `../screenshots/rpc/${id}.png`,
  })
  return result
}

// Screenshot without an RPC call (for "before" states, error cases, etc.)
async function snap(page: Page, id: string, section: string, caption: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  const shotPath = path.join(SHOTS_DIR, `${id}.png`)
  await page.screenshot({ path: shotPath })
  captures.push({
    section, id, title: caption,
    method: '', params: '', result: '',
    caption,
    screenshot: `../screenshots/rpc/${id}.png`,
  })
}

// ── Theme helper ───────────────────────────────────────────────────────────────

async function setDaylight(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('plexus-theme', 'daylight')
    document.documentElement.setAttribute('data-theme', 'daylight')
  })
}

// ── Test setup ─────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('RPC Feature Showcase', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.view-tabs', { timeout: 12_000 })
    await setDaylight(page)
    await waitForBridge()
    await rpcCall('ui.navigate',  { view: 'multi-explorer' })
    await rpcCall('ui.setTheme',  { theme: 'daylight' })
    await page.waitForTimeout(300)
  })

  // ── §1 Navigation ────────────────────────────────────────────────────────────

  test('§1 navigation — all views', async ({ page }) => {
    section('Navigation')

    for (const [view, tabLabel, caption] of [
      ['multi-explorer', 'explore',      'Explorer view: browse backends, plugins, and methods'],
      ['canvas',         'topology',     'Topology view: visualise backend graphs on a canvas'],
      ['sheet',          'sheet',        'Sheet view: tabular method schema and type browser'],
      ['wiring',         'wiring',       'Wiring view: visual dataflow pipeline builder'],
      ['orchestration',  'orchestrate',  'Orchestration view: sequence workflows with wired steps'],
    ] as const) {
      await capture(page, `nav-${view}`, `Navigate to ${view}`, 'ui.navigate', { view }, caption, 300)
      const tab = page.locator('.view-tab.active')
      await expect(tab).toHaveText(tabLabel)
    }
    // Return to explorer for subsequent tests
    await rpcCall('ui.navigate', { view: 'multi-explorer' })
  })

  // ── §2 Theme ─────────────────────────────────────────────────────────────────

  test('§2 theme — daylight and midnight', async ({ page }) => {
    section('Theme')
    await capture(page, 'theme-daylight', 'Daylight theme',  'ui.setTheme', { theme: 'daylight' }, 'ui.setTheme switches the full app to the daylight colour scheme', 400)
    await capture(page, 'theme-midnight', 'Midnight theme',  'ui.setTheme', { theme: 'midnight' }, 'ui.setTheme switches the full app to the midnight colour scheme', 400)
    await rpcCall('ui.setTheme', { theme: 'daylight' }) // restore for remaining shots
    await page.waitForTimeout(200)
  })

  // ── §3 Command palette ────────────────────────────────────────────────────────

  test('§3 command palette — open/close', async ({ page }) => {
    section('Command Palette')
    await capture(page, 'palette-open',  'Palette open',  'ui.palette.open',  {}, 'ui.palette.open overlays the fuzzy-search command palette', 300)
    await expect(page.locator('.palette-backdrop')).toBeVisible()
    await capture(page, 'palette-close', 'Palette close', 'ui.palette.close', {}, 'ui.palette.close dismisses the palette; the UI returns to its prior state', 300)
    await expect(page.locator('.palette-backdrop')).not.toBeVisible()
  })

  // ── §4 Backend management ─────────────────────────────────────────────────────

  test('§4 backend management — list, add, health, remove', async ({ page }) => {
    section('Backend Management')

    const listBefore = await capture(page, 'backends-list',   'List backends',     'backends.list',   {}, 'backends.list returns all currently connected backends', 300)
    await capture(page, 'backends-health', 'Backend health',   'backends.health',  {}, 'backends.health reports the live health status and latency of every backend', 300)
    await capture(page, 'backends-methods','Backend methods',  'backends.methods', {}, 'backends.methods returns the full index of methods across all connected backends', 200)

    // Add a transient backend so we can show the list growing
    await capture(page, 'backends-add', 'Add backend',
      'backends.add', { name: 'demo-bk', url: 'ws://localhost:9999' },
      'backends.add registers a new backend (it will appear disconnected until the server is reachable)', 500)

    const listAfter = await rpcCall('backends.list')
    const list = (listAfter.items[0] as { backends: { name: string }[] }).backends
    expect(list.some(b => b.name === 'demo-bk')).toBe(true)

    await capture(page, 'backends-remove', 'Remove backend',
      'backends.remove', { name: 'demo-bk' },
      'backends.remove deregisters a backend; its entry disappears from the connection bar', 400)
  })

  // ── §5 Wiring canvas — building a pipeline ────────────────────────────────────

  test('§5 wiring — build and run a pipeline via RPC', async ({ page }) => {
    section('Wiring Canvas')
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(400)
    await rpcCall('wiring.clear')
    await page.waitForTimeout(200)

    // Add two method nodes
    const n1 = await capture(page, 'wiring-add-node-1', 'Add first method node',
      'wiring.addMethod', { backend: 'substrate', method: 'substrate.echo.say', x: 80, y: 160 },
      'wiring.addMethod places a method node on the canvas at the given coordinates', 400)
    const node1Id = (n1.items[0] as { nodeId: string }).nodeId

    const n2 = await capture(page, 'wiring-add-node-2', 'Add second method node',
      'wiring.addMethod', { backend: 'substrate', method: 'substrate.echo.say', x: 500, y: 160 },
      'Adding a second node — both are now visible on the canvas', 400)
    const node2Id = (n2.items[0] as { nodeId: string }).nodeId

    // Label the nodes so the screenshot is readable
    await rpcCall('wiring.setNodeLabel', { nodeId: node1Id, label: 'Source' })
    await rpcCall('wiring.setNodeLabel', { nodeId: node2Id, label: 'Sink' })

    // Params on source node
    await capture(page, 'wiring-set-params', 'Set node params',
      'wiring.setNodeParams', { nodeId: node1Id, params: { message: 'hello from RPC' } },
      'wiring.setNodeParams sets static input values on a node without executing it', 400)

    // Connect them
    const conn = await capture(page, 'wiring-connect', 'Connect nodes',
      'wiring.connectNodes', { fromNodeId: node1Id, toNodeId: node2Id, toParam: 'message' },
      'wiring.connectNodes draws a directed edge — the source output feeds the sink\'s message param', 500)
    const edgeId = (conn.items[0] as { edgeId: string }).edgeId

    // Set edge routing
    await capture(page, 'wiring-routing', 'Set edge routing',
      'wiring.setEdgeRouting', { edgeId, mode: 'last' },
      'wiring.setEdgeRouting controls how multiple stream items from the source are aggregated (last/first/collect/each)', 400)

    // Auto layout so nodes are nicely spaced
    await capture(page, 'wiring-autolayout', 'Auto-layout nodes',
      'wiring.autoLayout', {},
      'wiring.autoLayout re-positions all nodes using a graph layout algorithm', 500)

    // Run the pipeline
    await capture(page, 'wiring-run', 'Run pipeline',
      'wiring.run', {},
      'wiring.run executes all nodes in topological order — result badges appear on each node', 800)

    // Get results
    const res = await capture(page, 'wiring-results', 'Get results',
      'wiring.getResults', {},
      'wiring.getResults returns the last execution output for every node in the pipeline', 300)
    const nodes = (res.items[0] as { nodes: { id: string; status: string; result: unknown }[] }).nodes
    expect(Array.isArray(nodes)).toBe(true)

    // Undo last action
    await capture(page, 'wiring-undo', 'Undo',
      'wiring.undo', {},
      'wiring.undo reverts the last canvas mutation (history is kept in-memory per session)', 400)

    // Redo
    await capture(page, 'wiring-redo', 'Redo',
      'wiring.redo', {},
      'wiring.redo re-applies the undone mutation', 400)

    // Export JSON
    const exported = await capture(page, 'wiring-export', 'Export pipeline JSON',
      'wiring.getJson', {},
      'wiring.getJson serialises the entire pipeline — nodes, edges, params — to a portable JSON string', 300)
    const parsed = JSON.parse((exported.items[0] as { json: string }).json) as { nodes: unknown[] }
    expect(Array.isArray(parsed.nodes)).toBe(true)

    // Clear canvas
    await capture(page, 'wiring-clear', 'Clear canvas',
      'wiring.clear', {},
      'wiring.clear removes every node and edge — the canvas is blank and ready for a new pipeline', 400)
    const st = (await rpcCall('wiring.getState')).items[0] as { nodeCount: number }
    expect(st.nodeCount).toBe(0)
  })

  // ── §6 Wiring transform & UI nodes ────────────────────────────────────────────

  test('§6 wiring — transform and UI node kinds', async ({ page }) => {
    section('Wiring Transform Nodes')
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(400)
    await rpcCall('wiring.clear')
    await page.waitForTimeout(200)

    let x = 60
    for (const [kind, subkind, orient] of [
      ['extract',  undefined,  undefined],
      ['template', undefined,  undefined],
      ['script',   undefined,  undefined],
      ['vars',     undefined,  undefined],
      ['widget',   'text',     undefined],
      ['widget',   'input',    undefined],
      ['widget',   'button',   undefined],
      ['widget',   'slider',   undefined],
      ['widget',   'table',    undefined],
      ['layout',   undefined,  'row'],
      ['layout',   undefined,  'col'],
    ] as const) {
      const p: Record<string, unknown> = { kind, x, y: 120 }
      if (subkind)  p['subkind']     = subkind
      if (orient)   p['orientation'] = orient
      await rpcCall('wiring.addTransform', p)
      x += 130
    }

    await page.waitForTimeout(400)
    await rpcCall('wiring.autoLayout')
    await page.waitForTimeout(400)

    await snap(page, 'wiring-transforms-all', 'Wiring Transform Nodes',
      'All transform and UI node kinds on a single canvas — extract, template, script, vars, widget (text/input/button/slider/table), and layout (row/col)')
  })

  // ── §7 Orchestration ──────────────────────────────────────────────────────────

  test('§7 orchestration — create, configure, run a workflow', async ({ page }) => {
    section('Orchestration')
    await rpcCall('ui.navigate', { view: 'orchestration' })
    await page.waitForTimeout(400)

    const created = await capture(page, 'orch-create', 'Create workflow',
      'orchestration.create', {},
      'orchestration.create adds a new empty workflow to the panel', 400)
    const wfId = (created.items[0] as { id: string }).id!

    await rpcCall('orchestration.select', { id: wfId })
    await capture(page, 'orch-rename', 'Rename workflow',
      'orchestration.rename', { name: 'RPC Showcase Workflow' },
      'orchestration.rename gives the selected workflow a human-readable name', 400)

    const s1 = await capture(page, 'orch-add-step-1', 'Add first step',
      'orchestration.addStep', { backend: 'substrate', method: 'substrate.echo.say' },
      'orchestration.addStep appends a method step to the selected workflow', 400)
    const stepId1 = (s1.items[0] as { stepId: string }).stepId!

    const s2 = await capture(page, 'orch-add-step-2', 'Add second step',
      'orchestration.addStep', { backend: 'substrate', method: 'substrate.echo.say' },
      'A second step is added — the workflow now has two echo.say steps in sequence', 400)
    const stepId2 = (s2.items[0] as { stepId: string }).stepId!

    await capture(page, 'orch-set-params', 'Set step params',
      'orchestration.setStepParams', { stepId: stepId1, params: { message: 'hello orchestration' } },
      'orchestration.setStepParams sets static parameter values on a step', 300)

    await capture(page, 'orch-wire', 'Wire steps',
      'orchestration.wireSteps',
      { fromStepId: stepId1, fromPath: '', toStepId: stepId2, toParam: 'message' },
      'orchestration.wireSteps pipes the output of step 1 into the message param of step 2', 400)

    await capture(page, 'orch-run', 'Run workflow',
      'orchestration.run', { id: wfId },
      'orchestration.run executes the workflow — each step\'s status is tracked and displayed', 800)

    await capture(page, 'orch-state', 'Get workflow state',
      'orchestration.getState', {},
      'orchestration.getState returns the run status of every workflow and its steps', 300)

    // Cleanup
    await rpcCall('orchestration.delete', { id: wfId })
    await page.waitForTimeout(200)
  })

  // ── §8 Replay panel ───────────────────────────────────────────────────────────

  test('§8 replay — seed history, then replay via RPC', async ({ page }) => {
    section('Replay Panel')

    // Clear stale history
    await page.evaluate(() => localStorage.removeItem('plexus-gamma:history'))

    // Seed the history by running a method via the method invoker UI
    await rpcCall('ui.navigate', { view: 'multi-explorer' })
    await page.waitForTimeout(300)
    await page.locator('.node-row', { hasText: 'echo' }).first().click()
    await expect(page.locator('.method-card').first()).toBeVisible({ timeout: 10_000 })
    // Click run on the first method card to generate a history entry
    const runBtn = page.locator('.invoke-btn').first()
    if (await runBtn.isVisible()) {
      await runBtn.click()
      await page.waitForTimeout(600)
    }

    // Open replay panel
    await page.locator('[title="Invocation history"]').click()
    await expect(page.locator('.replay-panel')).toBeVisible({ timeout: 8_000 })
    await page.waitForTimeout(300)

    // List records via RPC
    const listed = await capture(page, 'replay-list', 'List history',
      'replay.list', {},
      'replay.list returns all recorded invocations. The replay panel must be open.', 400)
    const history = listed.items[0] as { records: { id: string; method: string }[] } | { records: undefined } | unknown[]
    const records = Array.isArray(listed.items[0]) ? listed.items[0] as { id: string }[] : []

    if (records.length > 0) {
      const firstId = records[0]!.id
      await capture(page, 'replay-invoke', 'Re-invoke record',
        'replay.invoke', { id: firstId },
        'replay.invoke re-runs a historical invocation by ID and returns the fresh result', 600)

      await capture(page, 'replay-remove', 'Remove record',
        'replay.remove', { id: firstId },
        'replay.remove deletes a single history entry by ID', 400)
    }

    await capture(page, 'replay-clear', 'Clear history',
      'replay.clear', {},
      'replay.clear wipes the entire invocation history', 400)

    // Close panel
    await page.locator('.panel-close').click()
    await page.waitForTimeout(200)
  })

  // ── §9 Assertion suite ────────────────────────────────────────────────────────

  test('§9 assertion suite — add test, run, report', async ({ page }) => {
    section('Assertion Suite')

    // Mount AssertionSuite by opening the method invoker for echo.say
    await rpcCall('ui.navigate', { view: 'multi-explorer' })
    await page.waitForTimeout(300)
    await page.locator('.node-row', { hasText: 'echo' }).first().click()
    await expect(page.locator('.method-card').first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(400)

    const added = await capture(page, 'assertion-add', 'Add test case',
      'assertion.addTest',
      { name: 'echo roundtrip', method: 'substrate.echo.say', params: { message: 'ping' } },
      'assertion.addTest creates a test case. The invoker panel must be visible for the action handler to be registered.', 400)
    const addedResult = added.items[0] as { ok: boolean; id: string }

    await capture(page, 'assertion-list', 'List test cases',
      'assertion.list', { method: 'substrate.echo.say' },
      'assertion.list returns all test cases, optionally filtered by method name', 400)

    if (addedResult?.id) {
      await capture(page, 'assertion-run', 'Run single test',
        'assertion.runTest', { id: addedResult.id, backend: 'substrate' },
        'assertion.runTest executes one test case against a backend and returns the assertion results', 800)

      await capture(page, 'assertion-runall', 'Run all tests',
        'assertion.runAll', { backend: 'substrate' },
        'assertion.runAll runs every test case and returns a summary of passes and failures', 800)

      // Cleanup
      await rpcCall('assertion.removeTest', { id: addedResult.id })
    }
  })

  // ── §10 State watch stream ────────────────────────────────────────────────────

  test('§10 state.watch — streaming state events', async ({ page }) => {
    section('State Watch')
    // state.watch is a perpetual subscription — no single screenshot is meaningful.
    // We capture the UI before and after a navigation event to illustrate what the
    // stream emits.
    await snap(page, 'state-watch-before', 'State Watch', 'Before navigating — state.watch is subscribed and waiting for the next change')
    await rpcCall('ui.navigate', { view: 'wiring' })
    await page.waitForTimeout(300)
    await snap(page, 'state-watch-after', 'State Watch', 'After navigating — state.watch would have emitted { type: "view-changed", view: "wiring" }')
    await rpcCall('ui.navigate', { view: 'multi-explorer' })
  })

  // ── §11 invoke.call — live backend call ───────────────────────────────────────

  test('§11 invoke.call — call through the UI', async ({ page }) => {
    section('Live Invocation')

    await rpcCall('backends.add', { name: 'plexus-gamma', url: 'ws://localhost:44707' })
    await page.waitForTimeout(400)

    await capture(page, 'invoke-call', 'invoke.call (self-loop)',
      'invoke.call',
      { backend: 'plexus-gamma', method: 'plexus-gamma.ui.getView', params: {}, visible: false },
      'invoke.call streams the result of any method on any connected backend through the UI layer', 400)

    await rpcCall('backends.remove', { name: 'plexus-gamma' })
  })

  // ── Doc writer ────────────────────────────────────────────────────────────────

  test.afterAll(async () => {
    writeDoc()
  })
})

// ── Markdown document writer ───────────────────────────────────────────────────

function writeDoc() {
  const sections = [...new Set(captures.map(c => c.section))]

  const sectionDocs = sections.map(sec => {
    const items = captures.filter(c => c.section === sec)

    const entries = items.map(c => {
      const shot = c.screenshot
        ? `\n![${c.caption}](${c.screenshot})\n`
        : ''
      const call = c.method
        ? `\`\`\`ts\nrpcCall('${c.method}', ${c.params})\n// → ${c.result}\n\`\`\``
        : ''
      return `### \`${c.method || c.id}\`${c.title !== c.method ? ` — ${c.title}` : ''}

${c.caption}

${call}${shot}`
    }).join('\n---\n\n')

    return `## ${sec}\n\n${entries}`
  }).join('\n\n---\n\n')

  const availability = `
## Availability Reference

| Plugin | Availability |
|--------|-------------|
| \`ui.*\` | Always |
| \`backends.*\` | Always |
| \`invoke.*\` | Always (target backend must be reachable) |
| \`state.*\` | Always |
| \`screenshot.*\` | Always (requires headless browser process) |
| \`wiring.*\` | Wiring view active |
| \`orchestration.*\` | Orchestration view active |
| \`replay.*\` | Replay panel open |
| \`assertion.*\` | Method invoker panel visible |

See [rpc-availability.md](./rpc-availability.md) for the full method reference and design rationale.
`.trim()

  const stateWatch = `
## \`state.watch\` — Perpetual Subscription

\`state.watch\` is a streaming method that never emits a \`done\` item on its own.
It stays open indefinitely, pushing a new event each time a watched reactive ref changes:

| Event type | When emitted |
|---|---|
| \`view-changed\` | \`ui.navigate\` is called |
| \`theme-changed\` | \`ui.setTheme\` is called |
| \`backends-changed\` | any \`backends.*\` mutation |

\`\`\`ts
// Subscribe and log events until the caller cancels
for await (const event of rpcStream('state.watch', {})) {
  console.log(event) // { type: 'view-changed', view: 'wiring' }
}
\`\`\`

Cancel by closing the subscription (disconnect the WebSocket or send an \`unsubscribe\` request).
`.trim()

  const doc = `# plexus-gamma — RPC Feature Showcase

plexus-gamma exposes its entire UI as a JSON-RPC service on port 44707.
Every screenshot below was captured by invoking the RPC method shown — no mouse clicks.
The screenshots were generated by running \`bun run docs:rpc\`.

For a complete method reference and availability rules see [rpc-availability.md](./rpc-availability.md).

---

${sectionDocs}

---

${stateWatch}

---

${availability}
`

  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true })
  fs.writeFileSync(DOC_PATH, doc, 'utf8')
  console.log(`\n📄  Doc written → ${DOC_PATH}`)
  console.log(`📸  ${captures.filter(c => c.screenshot).length} screenshots embedded`)
}
