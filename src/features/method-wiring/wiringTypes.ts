import type { MethodEntry } from '../../components/CommandPalette.vue'

export type NodeKind = 'rpc' | 'extract' | 'template' | 'merge' | 'script' | 'vars' | 'widget' | 'layout'
export type RouteMode = 'auto' | 'each' | 'collect' | 'last' | 'first' | 'concat' | 'filter' | 'reduce'
export type WidgetKind = 'text' | 'input' | 'button' | 'slider' | 'table'
export type LayoutDir  = 'row' | 'col'

export interface RouteConfig {
  separator: string
  predicate: string
  reducer: string
  initial: string
  typeFilter: string[]
}

export interface NodeUi {
  // vars
  store: Record<string, unknown>
  storeName: string
  // widget
  widgetKind: WidgetKind
  label: string
  // layout
  dir: LayoutDir
  gap: number
  padding: number
  // binding / run
  binding: string      // input/slider: "varsNodeId.storeKey" — drives write-back
  autoRun: boolean     // auto-rerun pipeline on input/slider change
  runMode: 'full' | 'partial'  // button: full pipeline vs partial re-run from node
}

export const DEFAULT_UI: NodeUi = {
  store: {},
  storeName: 'vars',
  widgetKind: 'text',
  label: '',
  dir: 'row',
  gap: 8,
  padding: 12,
  binding: '',
  autoRun: false,
  runMode: 'partial',
}

export interface WireNode {
  id: string
  kind: NodeKind
  label?: string           // user-defined display name; overrides the derived title
  method?: MethodEntry
  transform: { path: string; template: string; code: string; inputNames: string[] }
  ui: NodeUi
  pos: { x: number; y: number }
  w: number
  params: Record<string, unknown>
  status: 'idle' | 'running' | 'done' | 'error'
  result: unknown
}

export interface WireEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  toParam: string
  routing: RouteMode
  routeConfig: RouteConfig
}
