import { ref, computed, watch, onUnmounted } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { PlexusRpcClient } from '../../lib/plexus/transport'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface BackendHealthState {
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

interface BackendEntry {
  name: string
  url: string
  client: PlexusRpcClient
  intervalId: ReturnType<typeof setInterval>
}

// ─── Latency percentile helpers ───────────────────────────────────────────────

export function computeLatencyStats(latencies: number[]): {
  avg: number
  p50: number
  p95: number
} {
  if (latencies.length === 0) return { avg: 0, p50: 0, p95: 0 }

  const sorted = [...latencies].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, v) => acc + v, 0)
  const avg = Math.round(sum / sorted.length)

  const p50idx = Math.floor(sorted.length * 0.5)
  const p95idx = Math.floor(sorted.length * 0.95)

  const p50 = sorted[Math.min(p50idx, sorted.length - 1)] ?? 0
  const p95 = sorted[Math.min(p95idx, sorted.length - 1)] ?? 0

  return { avg, p50, p95 }
}

// ─── Hash event parser ────────────────────────────────────────────────────────

function extractHashValue(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>
  if (typeof obj['event'] === 'string' && typeof obj['value'] === 'string') {
    return obj['value'] as string
  }
  return null
}

// ─── Status computation ───────────────────────────────────────────────────────

function computeStatus(
  lastSeenAt: number | null,
  hasError: boolean
): 'ok' | 'degraded' | 'down' {
  if (lastSeenAt === null || hasError) return 'down'
  const ageSec = (Date.now() - lastSeenAt) / 1000
  if (ageSec <= 10) return 'ok'
  if (ageSec <= 30) return 'degraded'
  return 'down'
}

// ─── Composable ──────────────────────────────────────────────────────────────

export function useBackendHealth(
  connections: Ref<{ name: string; url: string }[]>
): {
  health: ComputedRef<BackendHealth[]>
  recordCall(backendName: string, latencyMs: number, error: boolean): void
} {
  const states = ref<Map<string, BackendHealthState>>(new Map())
  const entries = ref<Map<string, BackendEntry>>(new Map())

  // ── internal helpers ──────────────────────────────────────────────────────

  function getOrCreateState(name: string, url: string): BackendHealthState {
    const existing = states.value.get(name)
    if (existing) return existing
    const s: BackendHealthState = {
      name,
      url,
      status: 'down',
      hashCurrent: null,
      hashChangedAt: null,
      lastSeenAt: null,
      latencies: [],
      errorCount: 0,
      callCount: 0,
    }
    states.value.set(name, s)
    return s
  }

  function addEntry(conn: { name: string; url: string }): void {
    if (entries.value.has(conn.name)) return

    const state = getOrCreateState(conn.name, conn.url)
    state.url = conn.url

    const client = new PlexusRpcClient({
      backend: conn.name,
      url: conn.url,
      connectionTimeout: 5000,
    })

    async function poll(): Promise<void> {
      const start = Date.now()
      const s = states.value.get(conn.name)
      if (!s) return

      s.callCount++

      try {
        const stream = client.call(`${conn.name}.hash`)
        let hashValue: string | null = null

        for await (const item of stream) {
          if (item.type === 'data') {
            hashValue = extractHashValue(item.content)
          }
          if (item.type === 'done' || item.type === 'error') break
        }

        const latencyMs = Date.now() - start

        // Update latencies (rolling window of 20)
        s.latencies = [...s.latencies.slice(-19), latencyMs]
        s.lastSeenAt = Date.now()

        if (hashValue !== null && hashValue !== s.hashCurrent) {
          s.hashChangedAt = Date.now()
          s.hashCurrent = hashValue
        } else if (hashValue !== null && s.hashCurrent === null) {
          s.hashCurrent = hashValue
        }

        s.status = computeStatus(s.lastSeenAt, false)
      } catch {
        s.errorCount++
        s.status = computeStatus(s.lastSeenAt, s.lastSeenAt === null)
      }
    }

    // Initial poll immediately
    void poll()

    const intervalId = setInterval(() => { void poll() }, 5000)

    entries.value.set(conn.name, {
      name: conn.name,
      url: conn.url,
      client,
      intervalId,
    })
  }

  function removeEntry(name: string): void {
    const entry = entries.value.get(name)
    if (!entry) return
    clearInterval(entry.intervalId)
    entry.client.disconnect()
    entries.value.delete(name)
  }

  // ── sync connections → entries ────────────────────────────────────────────

  function syncEntries(conns: { name: string; url: string }[]): void {
    const connNames = new Set(conns.map(c => c.name))

    // Add new
    for (const conn of conns) {
      addEntry(conn)
    }

    // Remove stale
    for (const name of entries.value.keys()) {
      if (!connNames.has(name)) {
        removeEntry(name)
      }
    }
  }

  // Initial sync
  syncEntries(connections.value)

  // Watch for changes
  watch(
    connections,
    (conns) => syncEntries(conns),
    { deep: true }
  )

  // Cleanup on unmount
  onUnmounted(() => {
    for (const name of entries.value.keys()) {
      removeEntry(name)
    }
  })

  // ── public API ────────────────────────────────────────────────────────────

  const health = computed<BackendHealth[]>(() => {
    return connections.value.map(conn => {
      const s = states.value.get(conn.name)
      if (!s) {
        return {
          name: conn.name,
          url: conn.url,
          status: 'down' as const,
          hashCurrent: null,
          hashChangedAt: null,
          lastSeenAt: null,
          latencies: [],
          errorCount: 0,
          callCount: 0,
        }
      }
      return {
        name: s.name,
        url: s.url,
        status: s.status,
        hashCurrent: s.hashCurrent,
        hashChangedAt: s.hashChangedAt,
        lastSeenAt: s.lastSeenAt,
        latencies: [...s.latencies],
        errorCount: s.errorCount,
        callCount: s.callCount,
      }
    })
  })

  function recordCall(backendName: string, latencyMs: number, error: boolean): void {
    const s = states.value.get(backendName)
    if (!s) return
    s.callCount++
    if (error) {
      s.errorCount++
    } else {
      s.latencies = [...s.latencies.slice(-19), latencyMs]
      s.lastSeenAt = Date.now()
      s.status = computeStatus(s.lastSeenAt, false)
    }
  }

  return { health, recordCall }
}
