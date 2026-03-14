import type { MethodEntry } from '../../components/CommandPalette.vue'

export type NodeKind = 'rpc' | 'extract' | 'template' | 'merge' | 'script'
export type RouteMode = 'auto' | 'each' | 'collect' | 'last' | 'first' | 'concat' | 'filter' | 'reduce'

export interface RouteConfig {
  separator: string
  predicate: string
  reducer: string
  initial: string
}

export interface WireNode {
  id: string
  kind: NodeKind
  method?: MethodEntry
  transform: { path: string; template: string; code: string; inputNames: string[] }
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
