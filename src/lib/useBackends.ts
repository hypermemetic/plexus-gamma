/**
 * Global singleton backends store.
 *
 * Module-level refs created once — all callers share the same reactive objects.
 * No prop drilling needed; import useBackends() directly in any component.
 */
import { ref, reactive, readonly, computed, watch } from 'vue'
import { getSharedClient, releaseSharedClient } from './plexus/clientRegistry'
import { getCachedTree, invalidateTree } from './plexus/schemaCache'
import { scanPortRange } from './plexus/discover'
import { flattenTree } from '../schema-walker'
import type { MethodEntry } from '../components/CommandPalette.vue'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackendConnection {
  name: string
  url: string
}

export interface BackendHealth {
  name: string
  url: string
  status: 'ok' | 'degraded' | 'down'
  hashCurrent: string | null
  hashChangedAt: number | null
  lastSeenAt: number | null
  latencies: number[]
  errorCount: number
  callCount: number
}

export interface RegistryBackend {
  name: string
  host: string
  port: number
  protocol: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function computeLatencyStats(latencies: number[]): {
  avg: number; p50: number; p95: number
} {
  if (latencies.length === 0) return { avg: 0, p50: 0, p95: 0 }
  const sorted = [...latencies].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, v) => acc + v, 0)
  const avg = Math.round(sum / sorted.length)
  const p50 = sorted[Math.min(Math.floor(sorted.length * 0.5), sorted.length - 1)] ?? 0
  const p95 = sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)] ?? 0
  return { avg, p50, p95 }
}

function extractHashValue(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>
  if (typeof obj['event'] === 'string' && typeof obj['value'] === 'string') {
    return obj['value'] as string
  }
  return null
}

function computeStatus(
  lastSeenAt: number | null,
  hasError: boolean,
): 'ok' | 'degraded' | 'down' {
  if (lastSeenAt === null || hasError) return 'down'
  const ageSec = (Date.now() - lastSeenAt) / 1000
  if (ageSec <= 10) return 'ok'
  if (ageSec <= 30) return 'degraded'
  return 'down'
}

// ─── Module-level singleton state ─────────────────────────────────────────────

const connections = ref<BackendConnection[]>([
  { name: 'substrate', url: 'ws://127.0.0.1:4444' },
])

const activeConn = ref<BackendConnection | null>(connections.value[0] ?? null)

const scanning = ref(false)

// Keyed by backend name; reactive so computed / templates track it
const healthStore = reactive<Record<string, BackendHealth>>({})

// Incremented per backend on every hash change — watchers can track this
export const hashSeq = reactive<Record<string, number>>({})

const methodIndex = ref<MethodEntry[]>([])

// ─── Tree loading / methodIndex rebuild ───────────────────────────────────────

async function refreshTree(conn: BackendConnection): Promise<void> {
  const rpc = getSharedClient(conn.name, conn.url)
  try {
    await rpc.connect()
    const tree = await getCachedTree(rpc, conn.name)
    const entries: MethodEntry[] = []
    for (const n of flattenTree(tree)) {
      const ns = n.path.length === 0 ? conn.name : n.path.join('.')
      for (const m of n.schema.methods) {
        entries.push({ backend: conn.name, fullPath: `${ns}.${m.name}`, path: n.path, method: m })
      }
    }
    methodIndex.value = [
      ...methodIndex.value.filter(e => e.backend !== conn.name),
      ...entries,
    ]
  } catch { /* connection error — skip */ }
}

// ─── Health + hash polling ─────────────────────────────────────────────────────

function getOrInitHealth(name: string, url: string): BackendHealth {
  if (!healthStore[name]) {
    healthStore[name] = {
      name, url,
      status: 'down',
      hashCurrent: null,
      hashChangedAt: null,
      lastSeenAt: null,
      latencies: [],
      errorCount: 0,
      callCount: 0,
    }
  }
  return healthStore[name]!
}

async function pollOnce(conn: BackendConnection): Promise<void> {
  const h = getOrInitHealth(conn.name, conn.url)
  const start = Date.now()
  h.callCount++

  try {
    const rpc = getSharedClient(conn.name, conn.url)
    const stream = rpc.call(`${conn.name}.hash`)
    let hashValue: string | null = null

    for await (const item of stream) {
      if (item.type === 'data') {
        hashValue = extractHashValue(item.content)
      }
      if (item.type === 'done' || item.type === 'error') break
    }

    const latencyMs = Date.now() - start
    h.latencies = [...h.latencies.slice(-19), latencyMs]
    h.lastSeenAt = Date.now()

    if (hashValue !== null && h.hashCurrent !== null && hashValue !== h.hashCurrent) {
      h.hashChangedAt = Date.now()
      h.hashCurrent = hashValue
      hashSeq[conn.name] = (hashSeq[conn.name] ?? 0) + 1
      invalidateTree(conn.name)
      void refreshTree(conn)
    } else if (hashValue !== null && h.hashCurrent === null) {
      h.hashCurrent = hashValue
    }

    h.status = computeStatus(h.lastSeenAt, false)
  } catch {
    h.errorCount++
    h.status = computeStatus(h.lastSeenAt, h.lastSeenAt === null)
  }
}

// ─── Poller management ────────────────────────────────────────────────────────

const pollers = new Map<string, ReturnType<typeof setInterval>>()

function startPoller(conn: BackendConnection): void {
  if (pollers.has(conn.name)) return
  void pollOnce(conn)
  pollers.set(conn.name, setInterval(() => void pollOnce(conn), 5000))
}

function stopPoller(name: string): void {
  const id = pollers.get(name)
  if (id !== undefined) {
    clearInterval(id)
    pollers.delete(name)
  }
}

function syncPolling(conns: BackendConnection[]): void {
  const names = new Set(conns.map(c => c.name))
  for (const conn of conns) {
    if (!pollers.has(conn.name)) startPoller(conn)
  }
  for (const name of pollers.keys()) {
    if (!names.has(name)) stopPoller(name)
  }
}

// Module-level watcher — runs once when the module is first imported
watch(connections, syncPolling, { immediate: true, deep: true })

// Eagerly load trees for all initial connections
for (const conn of connections.value) {
  void refreshTree(conn)
}

// ─── Public mutations ─────────────────────────────────────────────────────────

function addConnection(name: string, url: string): void {
  if (connections.value.find(c => c.name === name || c.url === url)) return
  const conn: BackendConnection = { name, url }
  connections.value.push(conn)
  activeConn.value = conn
  void refreshTree(conn)
}

function removeConnection(name: string): void {
  const conn = connections.value.find(c => c.name === name)
  if (!conn) return
  stopPoller(name)
  releaseSharedClient(conn.name, conn.url)
  invalidateTree(name)
  connections.value = connections.value.filter(c => c.name !== name)
  methodIndex.value = methodIndex.value.filter(e => e.backend !== name)
  delete healthStore[name]
  if (activeConn.value?.name === name) {
    activeConn.value = connections.value[0] ?? null
  }
}

function setActive(name: string): void {
  const conn = connections.value.find(c => c.name === name)
  if (conn) activeConn.value = conn
}

function mergeRegistryBackends(backends: RegistryBackend[]): void {
  for (const b of backends) {
    const url = `${b.protocol}://${b.host}:${b.port}`
    if (!connections.value.find(c => c.name === b.name || c.url === url)) {
      connections.value.push({ name: b.name, url })
    }
  }
}

async function scan(): Promise<void> {
  scanning.value = true
  try {
    for await (const b of scanPortRange(4440, 4450)) {
      if (!connections.value.find(c => c.name === b.name || c.url === b.url)) {
        connections.value.push({ name: b.name, url: b.url })
        if (!activeConn.value) activeConn.value = connections.value[0] ?? null
      }
    }
  } finally {
    scanning.value = false
  }
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useBackends() {
  return {
    connections: readonly(connections),
    activeConn:  readonly(activeConn),
    scanning:    readonly(scanning),
    health:      computed(() => Object.values(healthStore)),
    hashSeq,
    methodIndex,
    addConnection,
    removeConnection,
    setActive,
    mergeRegistryBackends,
    scan,
  }
}
