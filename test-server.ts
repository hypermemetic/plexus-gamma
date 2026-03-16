/**
 * Protocol smoke test for the plexus-gamma Bun server.
 * Run with: bun test-server.ts
 */

let passed = 0
let failed = 0

function ok(label: string) {
  console.log(`  ✓ ${label}`)
  passed++
}
function fail(label: string, detail?: string) {
  console.log(`  ✗ ${label}${detail ? ': ' + detail : ''}`)
  failed++
}

// Connect and collect subscription notifications until done/error
async function runCall(
  ws: WebSocket,
  id: number,
  method: string,
  params?: unknown,
): Promise<{ subId: number; items: unknown[] }> {
  return new Promise((resolve, reject) => {
    const items: unknown[] = []
    let subId: number | null = null
    const timeout = setTimeout(() => reject(new Error('timeout')), 5000)

    const prev = ws.onmessage
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as Record<string, unknown>

      // Direct response (subscriptionId or error)
      if (msg['id'] === id) {
        if ('error' in msg) { clearTimeout(timeout); reject(new Error(JSON.stringify(msg['error']))); return }
        subId = msg['result'] as number
        return
      }

      // Subscription notification
      const p = msg['params'] as Record<string, unknown> | undefined
      if (p && p['subscription'] === subId) {
        const item = p['result'] as Record<string, unknown>
        if (item['type'] === 'done' || item['type'] === 'error') {
          clearTimeout(timeout)
          ws.onmessage = prev
          if (item['type'] === 'error') {
            items.push(item)
          }
          resolve({ subId: subId!, items })
        } else {
          items.push(item)
        }
      }
    }

    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }))
  })
}

async function main() {
  // ── Test 1: _info (direct JSON-RPC, no subscription) ────────────────────────
  console.log('\nTest: _info')
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:44707')
    const timeout = setTimeout(() => reject(new Error('timeout')), 5000)
    ws.onopen = () => {
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as Record<string, unknown>
        const r = msg['result'] as Record<string, unknown>
        if (r?.['backend'] === 'plexus-gamma') ok('_info returns { backend: "plexus-gamma" }')
        else fail('_info result', JSON.stringify(r))
        clearTimeout(timeout)
        ws.close()
        resolve()
      }
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: '_info', params: [] }))
    }
    ws.onerror = (e) => { clearTimeout(timeout); reject(e) }
  })

  // ── Test 2: schema walk ──────────────────────────────────────────────────────
  console.log('\nTest: plexus-gamma.schema')
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:44707')
    ws.onopen = async () => {
      try {
        const { items } = await runCall(ws, 1, 'plexus-gamma.call', { method: 'plexus-gamma.schema', params: {} })
        const data = (items[0] as Record<string, unknown>)['content'] as Record<string, unknown>
        if (data?.['namespace'] === 'plexus-gamma') ok('root schema namespace = "plexus-gamma"')
        else fail('root schema namespace', JSON.stringify(data))
        const children = data?.['children'] as unknown[]
        if (children?.length === 4) ok('root schema has 4 children')
        else fail('root schema children', JSON.stringify(children))
      } catch (e) { fail('schema call threw', String(e)) }
      ws.close(); resolve()
    }
    ws.onerror = (e) => reject(e)
  })

  // ── Test 3: hash ─────────────────────────────────────────────────────────────
  console.log('\nTest: plexus-gamma.hash')
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:44707')
    ws.onopen = async () => {
      try {
        const { items } = await runCall(ws, 1, 'plexus-gamma.call', { method: 'plexus-gamma.hash', params: {} })
        const content = (items[0] as Record<string, unknown>)['content'] as Record<string, unknown>
        if (content?.['event'] === 'hash') ok('hash event has correct shape')
        else fail('hash content', JSON.stringify(content))
        if (typeof content?.['value'] === 'string') ok('hash value is a string')
        else fail('hash value not string')
      } catch (e) { fail('hash call threw', String(e)) }
      ws.close(); resolve()
    }
    ws.onerror = (e) => reject(e)
  })

  // ── Test 4: ui.navigate without bridge ───────────────────────────────────────
  console.log('\nTest: ui.navigate (no bridge)')
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:44707')
    ws.onopen = async () => {
      try {
        const { items } = await runCall(ws, 1, 'plexus-gamma.call', { method: 'ui.navigate', params: { view: 'wiring' } })
        const item = items[0] as Record<string, unknown>
        if (item['type'] === 'error') ok('ui.navigate returns error when no bridge')
        else fail('expected error item', JSON.stringify(item))
      } catch (e) { fail('nav call threw', String(e)) }
      ws.close(); resolve()
    }
    ws.onerror = (e) => reject(e)
  })

  // ── Test 5: bridge roundtrip ─────────────────────────────────────────────────
  console.log('\nTest: bridge roundtrip (simulated)')
  await new Promise<void>((resolve, reject) => {
    const bridge = new WebSocket('ws://localhost:44707/bridge')
    bridge.onopen = () => {
      bridge.send(JSON.stringify({ type: 'ready' }))

      // Client connects after bridge is ready
      const client = new WebSocket('ws://localhost:44707')
      client.onopen = async () => {
        // Send call from client
        client.send(JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'plexus-gamma.call',
          params: { method: 'ui.navigate', params: { view: 'wiring' } },
        }))

        let subId: number | null = null

        // Bridge receives the call and responds
        bridge.onmessage = (e) => {
          const msg = JSON.parse(e.data as string) as Record<string, unknown>
          if (msg['type'] === 'call') {
            const callId = msg['callId'] as string
            const method = msg['method'] as string
            ok(`bridge received call: ${method}`)
            // Simulate Vue app handling the call
            bridge.send(JSON.stringify({ type: 'done', callId }))
          }
        }

        // Client receives subscription id then done
        client.onmessage = (e) => {
          const msg = JSON.parse(e.data as string) as Record<string, unknown>
          if (msg['id'] === 1 && 'result' in msg) {
            subId = msg['result'] as number
            ok(`client got subscription id: ${subId}`)
          }
          const p = msg['params'] as Record<string, unknown> | undefined
          if (p && p['subscription'] === subId) {
            const item = p['result'] as Record<string, unknown>
            if (item['type'] === 'done') {
              ok('client received done notification')
              client.close(); bridge.close(); resolve()
            }
          }
        }
        client.onerror = (e) => reject(e)
      }
    }
    bridge.onerror = (e) => reject(e)
    setTimeout(() => reject(new Error('bridge test timeout')), 6000)
  })

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(40)}`)
  console.log(`  ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
