import { nextTick } from 'vue'
import type { Ref } from 'vue'
import type { WireNode, WireEdge } from './wiringTypes'

const GRID = 20

function snap(v: number): number {
  return Math.round(v / GRID) * GRID
}

export function useNodeLayout(
  nodes: Ref<WireNode[]>,
  edges: Ref<WireEdge[]>,
  layoutTick: Ref<number>,
): { autoLayout(): void } {
  function autoLayout(): void {
    const nodeList = nodes.value
    const edgeList = edges.value

    if (nodeList.length === 0) return

    // Build adjacency for Kahn's BFS
    const inDegree = new Map<string, number>()
    const children = new Map<string, string[]>()

    for (const n of nodeList) {
      inDegree.set(n.id, 0)
      children.set(n.id, [])
    }

    for (const e of edgeList) {
      inDegree.set(e.toNodeId, (inDegree.get(e.toNodeId) ?? 0) + 1)
      children.get(e.fromNodeId)?.push(e.toNodeId)
    }

    // Assign layers via BFS
    const layer = new Map<string, number>()
    const queue: string[] = []

    for (const [id, deg] of inDegree) {
      if (deg === 0) {
        queue.push(id)
        layer.set(id, 0)
      }
    }

    while (queue.length > 0) {
      const id = queue.shift()!
      const currentLayer = layer.get(id) ?? 0
      for (const childId of children.get(id) ?? []) {
        const newLayer = currentLayer + 1
        if ((layer.get(childId) ?? -1) < newLayer) {
          layer.set(childId, newLayer)
        }
        const newDeg = (inDegree.get(childId) ?? 1) - 1
        inDegree.set(childId, newDeg)
        if (newDeg === 0) queue.push(childId)
      }
    }

    // Group nodes by layer
    const byLayer = new Map<number, WireNode[]>()
    for (const node of nodeList) {
      const l = layer.get(node.id) ?? 0
      if (!byLayer.has(l)) byLayer.set(l, [])
      byLayer.get(l)!.push(node)
    }

    // Position nodes
    for (const [l, layerNodes] of byLayer) {
      layerNodes.forEach((node, idx) => {
        node.pos.x = snap(40 + l * 280)
        node.pos.y = snap(40 + idx * 200)
      })
    }

    // Wait for Vue to flush node position changes to the DOM before
    // recomputing edge paths (which use getBoundingClientRect)
    nextTick(() => { layoutTick.value++ })
  }

  return { autoLayout }
}
