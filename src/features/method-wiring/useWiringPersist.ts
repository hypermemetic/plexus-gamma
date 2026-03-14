import { watch } from 'vue'
import type { Ref } from 'vue'
import type { WireNode, WireEdge } from './wiringTypes'

const STORAGE_KEY = 'plexus-wiring-v1'

interface SerializedNode extends Omit<WireNode, 'status' | 'result'> {}

interface SerializedState {
  nodes: SerializedNode[]
  edges: WireEdge[]
}

function serializeState(nodes: WireNode[], edges: WireEdge[]): SerializedState {
  return {
    nodes: nodes.map(({ status: _s, result: _r, ...rest }) => rest),
    edges,
  }
}

function deserializeState(raw: SerializedState): { nodes: WireNode[]; edges: WireEdge[] } {
  return {
    nodes: raw.nodes.map(n => ({
      ...n,
      status: 'idle' as const,
      result: undefined,
    })),
    edges: raw.edges,
  }
}

export function useWiringPersist(
  nodes: Ref<WireNode[]>,
  edges: Ref<WireEdge[]>,
): { load(): boolean; exportJson(): void; importJson(s: string): boolean } {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function save(): void {
    try {
      const state = serializeState(nodes.value, edges.value)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // quota exceeded or private mode — ignore
    }
  }

  function debouncedSave(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(save, 500)
  }

  watch([nodes, edges], debouncedSave, { deep: true })

  function load(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const parsed = JSON.parse(raw) as SerializedState
      if (!parsed.nodes || !parsed.edges) return false
      const { nodes: restoredNodes, edges: restoredEdges } = deserializeState(parsed)
      nodes.value = restoredNodes
      edges.value = restoredEdges
      return true
    } catch {
      return false
    }
  }

  function exportJson(): void {
    const state = serializeState(nodes.value, edges.value)
    const json = JSON.stringify(state, null, 2)
    navigator.clipboard.writeText(json).catch(() => { alert(json) })
  }

  function importJson(s: string): boolean {
    try {
      const parsed = JSON.parse(s) as SerializedState
      if (!parsed.nodes || !parsed.edges) return false
      const { nodes: restoredNodes, edges: restoredEdges } = deserializeState(parsed)
      nodes.value = restoredNodes
      edges.value = restoredEdges
      return true
    } catch {
      return false
    }
  }

  return { load, exportJson, importJson }
}
