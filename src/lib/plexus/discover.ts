export interface DiscoveredBackend {
  name: string
  url: string
  port: number
}

export async function probePort(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 1200,
): Promise<DiscoveredBackend | null> {
  return new Promise((resolve) => {
    let settled = false
    const url = `ws://${host}:${port}`

    const timer = setTimeout(() => {
      if (!settled) { settled = true; ws?.close(); resolve(null) }
    }, timeoutMs)

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      clearTimeout(timer)
      resolve(null)
      return
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: '_info', params: [] }))
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        if ((msg.method === 'subscription' || msg.method === 'result') && msg.params?.result?.type === 'data') {
          const backend = msg.params.result.content?.backend
          if (backend && !settled) {
            settled = true
            clearTimeout(timer)
            ws.close()
            resolve({ name: backend, url, port })
          }
        } else if ((msg.method === 'subscription' || msg.method === 'result') && msg.params?.result?.type === 'done') {
          if (!settled) { settled = true; clearTimeout(timer); ws.close(); resolve(null) }
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onerror = () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(null) }
    }

    ws.onclose = () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(null) }
    }
  })
}

export async function* scanPortRange(
  start: number,
  end: number,
  opts?: { host?: string; concurrency?: number; timeout?: number },
): AsyncGenerator<DiscoveredBackend> {
  const host = opts?.host ?? '127.0.0.1'
  const concurrency = opts?.concurrency ?? 20
  const timeout = opts?.timeout ?? 1200

  for (let port = start; port <= end; port += concurrency) {
    const batch: Promise<DiscoveredBackend | null>[] = []
    for (let p = port; p < Math.min(port + concurrency, end + 1); p++) {
      batch.push(probePort(p, host, timeout))
    }
    const results = await Promise.allSettled(batch)
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value !== null) {
        yield r.value
      }
    }
  }
}
