import { watch } from 'vue'
import { useUiState, type ViewName } from './useUiState'
import { useBackends, type BackendConnection, type BackendHealth } from './useBackends'
import { getSharedClient } from './plexus/clientRegistry'
import type { PlexusStreamItem } from './plexus/types'
import type { MethodEntry } from '../components/CommandPalette.vue'

// ─── State event types ────────────────────────────────────────────────────────

export type StateEvent =
  | { type: 'view-changed';     view: ViewName }
  | { type: 'theme-changed';    theme: string }
  | { type: 'backends-changed'; backends: BackendConnection[] }

// ─── Module-level state watcher registry ─────────────────────────────────────

const stateListeners = new Set<(e: StateEvent) => void>()

function emitState(e: StateEvent) {
  for (const l of stateListeners) l(e)
}

// Set up module-level watchers once on import
;(function initStateWatchers() {
  const { currentView, theme } = useUiState()
  const { connections } = useBackends()
  watch(currentView, view => emitState({ type: 'view-changed', view }))
  watch(theme, t    => emitState({ type: 'theme-changed', theme: t }))
  watch(connections, b => emitState({ type: 'backends-changed', backends: [...b] }), { deep: true })
})()

// ─── makeStateWatcher ─────────────────────────────────────────────────────────

function makeStateWatcher(): AsyncGenerator<StateEvent> {
  // Box the resolver in an object so TypeScript control-flow analysis
  // doesn't narrow it to `never` inside the async generator.
  const ctrl: { resolve: ((e: StateEvent | null) => void) | null } = { resolve: null }
  const queue: StateEvent[] = []
  let closed = false

  function listener(e: StateEvent) {
    if (closed) return
    if (ctrl.resolve) { const r = ctrl.resolve; ctrl.resolve = null; r(e) }
    else queue.push(e)
  }

  stateListeners.add(listener)

  return (async function* () {
    try {
      while (true) {
        if (queue.length > 0) { yield queue.shift()!; continue }
        const e = await new Promise<StateEvent | null>(r => { ctrl.resolve = r })
        if (e === null) return
        yield e
      }
    } finally {
      stateListeners.delete(listener)
      closed = true
      ctrl.resolve?.(null)
    }
  })()
}

// ─── useDispatch ──────────────────────────────────────────────────────────────

export function useDispatch() {
  const { currentView, theme, navigateTo } = useUiState()
  const { connections, addConnection, removeConnection, setActive, methodIndex, health } = useBackends()

  return {
    navigate(view: ViewName): void               { currentView.value = view },
    getView(): ViewName                          { return currentView.value },
    setTheme(t: 'daylight' | 'midnight'): void  { theme.value = t },
    getTheme(): string                           { return theme.value },

    addBackend(name: string, url: string): void  { addConnection(name, url) },
    removeBackend(name: string): void            { removeConnection(name) },
    setActiveBackend(name: string): void         { setActive(name) },
    listBackends(): BackendConnection[]          { return [...connections.value] },
    getHealth(): BackendHealth[]                 { return [...health.value] },
    getMethods(): MethodEntry[]                  { return [...methodIndex.value] },

    async *invokeMethod(
      backend: string,
      method: string,
      params: unknown,
      visible: boolean,
    ): AsyncGenerator<PlexusStreamItem> {
      if (visible) {
        currentView.value = 'multi-explorer'
        setActive(backend)
        navigateTo.value = { backend, path: method.split('.').slice(0, -1) }
      }
      const conn = connections.value.find(c => c.name === backend)
      if (!conn) throw new Error(`Backend not found: ${backend}`)
      const rpc = getSharedClient(backend, conn.url)
      yield* rpc.call(method, params)
    },

    watchState(): AsyncGenerator<StateEvent> {
      return makeStateWatcher()
    },
  }
}
