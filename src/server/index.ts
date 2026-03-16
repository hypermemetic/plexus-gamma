import { randomUUID } from 'crypto'
import type { BridgeCall, BridgeMessage } from './bridge'
import type { PlexusStreamItem, StreamMetadata } from '../lib/plexus/types'
import type { PluginSchema } from '../plexus-schema'

const SCHEMA_HASH = 'plexus-gamma-v1'

// ─── Server state ────────────────────────────────────────────────────────────

type WsData = { role: 'bridge' } | { role: 'client'; id: string }

let bridgeWs: import('bun').ServerWebSocket<WsData> | null = null
const clientSockets = new Map<string, import('bun').ServerWebSocket<WsData>>()
const pendingBridgeCalls = new Map<string, { clientId: string; subscriptionId: number }>()
let nextSubId = 1

// ─── Helpers ─────────────────────────────────────────────────────────────────

function meta(): StreamMetadata {
  return { provenance: ['plexus-gamma'], plexusHash: SCHEMA_HASH, timestamp: Date.now() / 1000 }
}

function sendSubNotif(clientId: string, subscriptionId: number, item: PlexusStreamItem) {
  const ws = clientSockets.get(clientId)
  if (!ws) return
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    method: 'subscription',
    params: { subscription: subscriptionId, result: item },
  }))
}

function sendDataDone(clientId: string, subId: number, content: unknown) {
  sendSubNotif(clientId, subId, { type: 'data', metadata: meta(), contentType: 'plexus-gamma.result', content })
  sendSubNotif(clientId, subId, { type: 'done', metadata: meta() })
}

function sendErrorDone(clientId: string, subId: number, message: string) {
  sendSubNotif(clientId, subId, { type: 'error', metadata: meta(), message, recoverable: false })
}

// ─── Schema (hardcoded) ───────────────────────────────────────────────────────

const ROOT_SCHEMA: PluginSchema = {
  namespace: 'plexus-gamma',
  version: '0.1.0',
  description: 'plexus-gamma UI control backend',
  hash: SCHEMA_HASH,
  methods: [],
  children: [
    { namespace: 'ui',       description: 'UI navigation and theme',        hash: SCHEMA_HASH },
    { namespace: 'backends', description: 'Backend connection management',  hash: SCHEMA_HASH },
    { namespace: 'invoke',   description: 'Remote method invocation',       hash: SCHEMA_HASH },
    { namespace: 'state',    description: 'Live UI state subscription',     hash: SCHEMA_HASH },
  ],
}

const UI_SCHEMA: PluginSchema = {
  namespace: 'ui', version: '0.1.0', description: 'UI navigation and theme',
  hash: SCHEMA_HASH,
  methods: [
    { name: 'navigate', description: 'Switch to a view tab', hash: SCHEMA_HASH, streaming: false, bidirectional: false,
      params: { type: 'object', properties: { view: { type: 'string' } }, required: ['view'] } },
    { name: 'getView',  description: 'Get current view name', hash: SCHEMA_HASH, streaming: false, bidirectional: false,
      params: { type: 'object', properties: {} } },
    { name: 'setTheme', description: 'Set UI theme', hash: SCHEMA_HASH, streaming: false, bidirectional: false,
      params: { type: 'object', properties: { theme: { type: 'string' } }, required: ['theme'] } },
    { name: 'getTheme', description: 'Get current theme', hash: SCHEMA_HASH, streaming: false, bidirectional: false,
      params: { type: 'object', properties: {} } },
  ],
}

const BACKENDS_SCHEMA: PluginSchema = {
  namespace: 'backends', version: '0.1.0', description: 'Backend connection management',
  hash: SCHEMA_HASH,
  methods: [
    { name: 'list',      description: 'List all connected backends', hash: SCHEMA_HASH, streaming: false, bidirectional: false, params: { type: 'object', properties: {} } },
    { name: 'add',       description: 'Add a new backend connection', hash: SCHEMA_HASH, streaming: false, bidirectional: false,
      params: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' } }, required: ['name', 'url'] } },
    { name: 'remove',    description: 'Remove a backend connection', hash: SCHEMA_HASH, streaming: false, bidirectional: false,
      params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
    { name: 'setActive', description: 'Set the active backend', hash: SCHEMA_HASH, streaming: false, bidirectional: false,
      params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
    { name: 'health',    description: 'Get health status of all backends', hash: SCHEMA_HASH, streaming: false, bidirectional: false, params: { type: 'object', properties: {} } },
    { name: 'methods',   description: 'List all known methods across backends', hash: SCHEMA_HASH, streaming: false, bidirectional: false, params: { type: 'object', properties: {} } },
  ],
}

const INVOKE_SCHEMA: PluginSchema = {
  namespace: 'invoke', version: '0.1.0', description: 'Remote method invocation through the UI',
  hash: SCHEMA_HASH,
  methods: [
    { name: 'call', description: 'Invoke a method on a connected backend, optionally navigating to it in the UI',
      hash: SCHEMA_HASH, streaming: true, bidirectional: false,
      params: { type: 'object',
        properties: { backend: { type: 'string' }, method: { type: 'string' }, params: { type: 'object' }, visible: { type: 'boolean' } },
        required: ['backend', 'method'] } },
  ],
}

const STATE_SCHEMA: PluginSchema = {
  namespace: 'state', version: '0.1.0', description: 'Live UI state subscription',
  hash: SCHEMA_HASH,
  methods: [
    { name: 'watch', description: 'Stream live UI state change events', hash: SCHEMA_HASH, streaming: true, bidirectional: false,
      params: { type: 'object', properties: {} } },
  ],
}

// ─── Inner method dispatcher ──────────────────────────────────────────────────

function dispatchMethod(clientId: string, subId: number, innerMethod: string, innerParams: unknown) {
  switch (innerMethod) {
    case 'plexus-gamma.schema': sendDataDone(clientId, subId, ROOT_SCHEMA); return
    case 'ui.schema':           sendDataDone(clientId, subId, UI_SCHEMA); return
    case 'backends.schema':     sendDataDone(clientId, subId, BACKENDS_SCHEMA); return
    case 'invoke.schema':       sendDataDone(clientId, subId, INVOKE_SCHEMA); return
    case 'state.schema':        sendDataDone(clientId, subId, STATE_SCHEMA); return
    case 'plexus-gamma.hash':   sendDataDone(clientId, subId, { event: 'hash', value: SCHEMA_HASH }); return
    case '_info':               sendDataDone(clientId, subId, { backend: 'plexus-gamma', version: '0.1.0' }); return
  }

  // Forward to bridge
  if (!bridgeWs) {
    sendErrorDone(clientId, subId, 'No UI bridge connected')
    return
  }
  const callId = randomUUID()
  pendingBridgeCalls.set(callId, { clientId, subscriptionId: subId })
  const msg: BridgeCall = { type: 'call', callId, method: innerMethod, params: innerParams }
  bridgeWs.send(JSON.stringify(msg))
}

// ─── WebSocket handlers ───────────────────────────────────────────────────────

function open(ws: import('bun').ServerWebSocket<WsData>) {
  const d = ws.data
  if (d.role === 'bridge') {
    bridgeWs = ws
    console.log('[plexus-gamma] bridge connected')
  } else if (d.role === 'client') {
    clientSockets.set(d.id, ws)
    console.log(`[plexus-gamma] client connected: ${d.id}`)
  }
}

function message(ws: import('bun').ServerWebSocket<WsData>, raw: string | Buffer) {
  const text = typeof raw === 'string' ? raw : raw.toString()
  let msg: unknown
  try { msg = JSON.parse(text) } catch { return }

  const d = ws.data

  if (d.role === 'bridge') {
    const bm = msg as BridgeMessage
    if (bm.type === 'ready') {
      console.log('[plexus-gamma] bridge ready')
    } else if (bm.type === 'item') {
      const pending = pendingBridgeCalls.get(bm.callId)
      if (pending) sendSubNotif(pending.clientId, pending.subscriptionId, bm.item)
    } else if (bm.type === 'done') {
      const pending = pendingBridgeCalls.get(bm.callId)
      if (pending) {
        sendSubNotif(pending.clientId, pending.subscriptionId, { type: 'done', metadata: meta() })
        pendingBridgeCalls.delete(bm.callId)
      }
    } else if (bm.type === 'error') {
      const pending = pendingBridgeCalls.get(bm.callId)
      if (pending) {
        sendErrorDone(pending.clientId, pending.subscriptionId, bm.message)
        pendingBridgeCalls.delete(bm.callId)
      }
    }
    return
  }

  if (d.role === 'client') {
    const req = msg as { jsonrpc: string; id: number; method: string; params?: unknown }

    // Direct _info (raw JSON-RPC, no subscription)
    if (req.method === '_info') {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { backend: 'plexus-gamma', version: '0.1.0' } }))
      return
    }

    if (req.method === 'plexus-gamma.call') {
      const p = req.params as { method: string; params?: unknown }
      const subId = nextSubId++
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: subId }))
      dispatchMethod(d.id, subId, p.method, p.params ?? {})
      return
    }

    // Unknown method
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } }))
  }
}

function close(ws: import('bun').ServerWebSocket<WsData>) {
  const d = ws.data
  if (d.role === 'bridge') {
    bridgeWs = null
    console.log('[plexus-gamma] bridge disconnected')
    // Cancel all pending bridge calls
    for (const [callId, pending] of pendingBridgeCalls) {
      sendErrorDone(pending.clientId, pending.subscriptionId, 'Bridge disconnected')
      pendingBridgeCalls.delete(callId)
    }
  } else if (d.role === 'client') {
    clientSockets.delete(d.id)
    console.log(`[plexus-gamma] client disconnected: ${d.id}`)
  }
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = Bun.serve<WsData>({
  port: 44707,
  fetch(req, server) {
    const url = new URL(req.url)
    const role = url.pathname === '/bridge' ? 'bridge' : 'client'
    const data: WsData = role === 'bridge' ? { role: 'bridge' } : { role: 'client', id: randomUUID() }
    const ok = server.upgrade(req, { data })
    if (ok) return undefined
    return new Response('plexus-gamma server', { status: 200 })
  },
  websocket: { open, message, close },
})

console.log(`plexus-gamma server listening on :${server.port}`)
