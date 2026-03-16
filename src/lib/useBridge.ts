import { onMounted, onUnmounted } from 'vue'
import { useDispatch } from './useDispatch'
import type { ViewName } from './useUiState'
import type { BridgeCall, BridgeMessage } from '../server/bridge'
import type { PlexusStreamItem } from './plexus/types'

// ─── routeToDispatch ──────────────────────────────────────────────────────────

async function* routeToDispatch(
  method: string,
  params: Record<string, unknown>,
  dispatch: ReturnType<typeof useDispatch>,
): AsyncGenerator<PlexusStreamItem> {
  const meta = () => ({
    provenance: ['plexus-gamma'],
    plexusHash: 'plexus-gamma-v1',
    timestamp: Date.now() / 1000,
  })

  async function* yieldResult(content: unknown): AsyncGenerator<PlexusStreamItem> {
    yield { type: 'data', metadata: meta(), contentType: 'plexus-gamma.result', content }
    yield { type: 'done', metadata: meta() }
  }

  switch (method) {
    case 'ui.navigate':
      dispatch.navigate(params['view'] as ViewName)
      yield* yieldResult({ ok: true })
      return
    case 'ui.getView':
      yield* yieldResult({ view: dispatch.getView() })
      return
    case 'ui.setTheme':
      dispatch.setTheme(params['theme'] as 'daylight' | 'midnight')
      yield* yieldResult({ ok: true })
      return
    case 'ui.getTheme':
      yield* yieldResult({ theme: dispatch.getTheme() })
      return
    case 'backends.list':
      yield* yieldResult({ backends: dispatch.listBackends() })
      return
    case 'backends.add':
      dispatch.addBackend(params['name'] as string, params['url'] as string)
      yield* yieldResult({ ok: true })
      return
    case 'backends.remove':
      dispatch.removeBackend(params['name'] as string)
      yield* yieldResult({ ok: true })
      return
    case 'backends.setActive':
      dispatch.setActiveBackend(params['name'] as string)
      yield* yieldResult({ ok: true })
      return
    case 'backends.health':
      yield* yieldResult({ health: dispatch.getHealth() })
      return
    case 'backends.methods':
      yield* yieldResult({ methods: dispatch.getMethods() })
      return
    case 'invoke.call':
      yield* dispatch.invokeMethod(
        params['backend'] as string,
        params['method'] as string,
        params['params'] ?? {},
        (params['visible'] as boolean | undefined) ?? false,
      )
      return
    case 'state.watch':
      for await (const event of dispatch.watchState()) {
        yield { type: 'data', metadata: meta(), contentType: 'plexus-gamma.state', content: event }
      }
      yield { type: 'done', metadata: meta() }
      return
    default:
      yield { type: 'error', metadata: meta(), message: `Unknown method: ${method}`, recoverable: false }
      return
  }
}

// ─── useBridge ────────────────────────────────────────────────────────────────

export function useBridge() {
  const dispatch = useDispatch()
  let ws: WebSocket | null = null
  const activeStreams = new Map<string, AbortController>()

  function send(msg: BridgeMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  async function handleCall(msg: BridgeCall) {
    const { callId, method, params } = msg
    const p = (params ?? {}) as Record<string, unknown>
    const ac = new AbortController()
    activeStreams.set(callId, ac)

    try {
      const gen = routeToDispatch(method, p, dispatch)
      for await (const item of gen) {
        if (ac.signal.aborted) break
        send({ type: 'item', callId, item })
      }
      if (!ac.signal.aborted) {
        send({ type: 'done', callId })
      }
    } catch (err) {
      send({ type: 'error', callId, message: err instanceof Error ? err.message : String(err) })
    } finally {
      activeStreams.delete(callId)
    }
  }

  function connect() {
    ws = new WebSocket('ws://localhost:44707/bridge')

    ws.onopen = () => {
      const readyMsg: BridgeMessage = { type: 'ready' }
      ws!.send(JSON.stringify(readyMsg))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as BridgeCall
        if (msg.type === 'call') void handleCall(msg)
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      ws = null
      setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      // Let onclose handle reconnect
    }
  }

  onMounted(connect)

  onUnmounted(() => {
    for (const ac of activeStreams.values()) ac.abort()
    activeStreams.clear()
    ws?.close()
    ws = null
  })
}
