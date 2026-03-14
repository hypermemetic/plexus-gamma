import { watch } from 'vue'
import type { Ref } from 'vue'
import type { WireNode, WireEdge, RouteConfig, NodeUi } from './wiringTypes'
import { DEFAULT_UI } from './wiringTypes'
import type { PanelMode } from '../../components/FloatPanel.vue'

const STORAGE_KEY = 'plexus-wiring-v1'

interface SerializedNode extends Omit<WireNode, 'status' | 'result'> {}

interface SerializedState {
  nodes: SerializedNode[]
  edges: WireEdge[]
  selectedNodeId?: string | null
  panelMode?: PanelMode
  pan?: { x: number; y: number }
  zoom?: number
}

interface UIRefs {
  selectedNodeId: Ref<string | null>
  panelMode: Ref<PanelMode>
  pan: Ref<{ x: number; y: number }>
  zoom: Ref<number>
}

function serializeState(
  nodes: WireNode[],
  edges: WireEdge[],
  ui: UIRefs,
): SerializedState {
  return {
    nodes: nodes.map(({ status: _s, result: _r, ...rest }) => rest),
    edges,
    selectedNodeId: ui.selectedNodeId.value,
    panelMode: ui.panelMode.value,
    pan: { ...ui.pan.value },
    zoom: ui.zoom.value,
  }
}

function deserializeState(raw: SerializedState): {
  nodes: WireNode[]
  edges: WireEdge[]
  selectedNodeId: string | null
  panelMode: PanelMode
  pan: { x: number; y: number }
  zoom: number
} {
  return {
    nodes: raw.nodes.map(n => ({
      ...n,
      status: 'idle' as const,
      result: undefined,
      ui: { ...DEFAULT_UI, ...(n.ui as Partial<NodeUi> | undefined) },
    })),
    edges: raw.edges.map(e => ({
      ...e,
      routeConfig: { separator: '\n', predicate: '', reducer: '', initial: '', typeFilter: [], ...(e.routeConfig as Partial<RouteConfig>) } as RouteConfig,
    })),
    selectedNodeId: raw.selectedNodeId ?? null,
    panelMode: raw.panelMode ?? 'float',
    pan: raw.pan ?? { x: 0, y: 0 },
    zoom: raw.zoom ?? 1,
  }
}

export function useWiringPersist(
  nodes: Ref<WireNode[]>,
  edges: Ref<WireEdge[]>,
  ui: UIRefs,
): { load(): boolean; exportJson(): void; importJson(s: string): boolean } {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(nodes.value, edges.value, ui)))
    } catch {
      // quota exceeded or private mode — ignore
    }
  }

  function debouncedSave(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(save, 500)
  }

  watch([nodes, edges, ui.selectedNodeId, ui.panelMode, ui.pan, ui.zoom], debouncedSave, { deep: true })

  function load(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const parsed = JSON.parse(raw) as SerializedState
      if (!parsed.nodes || !parsed.edges) return false
      const restored = deserializeState(parsed)
      nodes.value = restored.nodes
      edges.value = restored.edges
      ui.selectedNodeId.value = restored.selectedNodeId
      ui.panelMode.value = restored.panelMode
      ui.pan.value = restored.pan
      ui.zoom.value = restored.zoom
      return true
    } catch {
      return false
    }
  }

  function exportJson(): void {
    // Export only the pipeline data (nodes + edges), not UI state
    const state = { nodes: nodes.value.map(({ status: _s, result: _r, ...rest }) => rest), edges: edges.value }
    const json = JSON.stringify(state, null, 2)
    navigator.clipboard.writeText(json).catch(() => { alert(json) })
  }

  function importJson(s: string): boolean {
    try {
      const parsed = JSON.parse(s) as SerializedState
      if (!parsed.nodes || !parsed.edges) return false
      const restored = deserializeState(parsed)
      nodes.value = restored.nodes
      edges.value = restored.edges
      return true
    } catch {
      return false
    }
  }

  return { load, exportJson, importJson }
}
